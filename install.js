'use strict';

const fs = require('fs');
const os = require('os');
const { dirname, extname } = require('path');
const ProgressBar = require('progress');
const request = require('@derhuerst/http-basic');
const { createGunzip } = require('zlib');
const { pipeline } = require('stream');
const ffmpegPath = require('./index');
const pkg = require('./package');

const exitOnError = err => {
  console.error(err);
  process.exit(1);
};
const exitOnErrorOrWarnWith = msg => err => {
  if (err.statusCode === 404) console.warn(msg);
  else exitOnError(err);
};

if (!ffmpegPath) {
  exitOnError('ffmpeg-static install failed: No binary found for architecture');
}

try {
  if (fs.statSync(ffmpegPath).isFile()) {
    console.info('ffmpeg is installed already.');
    process.exit(0);
  }
} catch (err) {
  if (err && err.code !== 'ENOENT') exitOnError(err);
}

// https://github.com/request/request/blob/a9557c9e7de2c57d92d9bab68a416a87d255cd3d/lib/getProxyFromURI.js#L66-L71

const isGzUrl = url => {
  const path = new URL(url).pathname.split('/');
  const filename = path[path.length - 1];
  return filename && extname(filename) === '.gz';
};

const noop = () => {};
function downloadFile(url, destinationPath, progressCallback = noop) {
  let fulfill,
    reject;
  let totalBytes = 0;

  const promise = new Promise((x, y) => {
    fulfill = x;
    reject = y;
  });

  request('GET', url, {
    followRedirects: true,
    maxRedirects: 3,
    gzip: true,
    timeout: 30 * 1000, // 30s
    retry: true,
  }, (err, response) => {
    if (err || response.statusCode !== 200) {
      err = err || new Error('Download failed.');
      if (response) {
        err.url = response.url;
        err.statusCode = response.statusCode;
      }
      reject(err);
      return;
    }

    if (!fs.existsSync(dirname(destinationPath))) {
      fs.mkdirSync(dirname(destinationPath), { recursive: true });
    }
    const file = fs.createWriteStream(destinationPath);
    const streams = isGzUrl(url)
      ? [ response.body, createGunzip(), file ]
      : [ response.body, file ];
    pipeline(
      ...streams,
      err => {
        if (err) {
          err.url = response.url;
          err.statusCode = response.statusCode;
          reject(err);
        } else fulfill();
      }
    );

    if (!response.fromCache && progressCallback) {
      const cLength = response.headers['content-length'];
      totalBytes = cLength ? parseInt(cLength, 10) : null;
      response.body.on('data', chunk => {
        progressCallback(chunk.length, totalBytes);
      });
    }
  });

  return promise;
}

const arch = process.env.npm_config_arch || os.arch();
const platform = process.env.npm_config_platform || os.platform();

const release = (
  process.env.FFMPEG_BINARY_RELEASE ||
  pkg['ffmpeg-static']['binary-release-tag']
);
const releaseName = (
  pkg['ffmpeg-static']['binary-release-name'] ||
  release
);
const baseUrl = (
  process.env.FFMPEG_BINARY_CDNURL ||
  pkg['ffmpeg-static']['binary-url'] ||
  'https://github.com/eugeneware/ffmpeg-static/releases/download'
);
// const baseUrl = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}`
// const baseUrl = `https://cdn.npmmirror.com/binaries/ffmpeg-static/${release}`;
// https://cdn.npmmirror.com/binaries/ffmpeg-static/b4.4.1/win32-x64.gz;

const downloadUrl = `${baseUrl}/${release}/${platform}-${arch}.gz`;
// const readmeUrl = `${baseUrl}/${release}/${platform}-${arch}.README`;
const licenseUrl = `${baseUrl}/${release}/${platform}-${arch}.LICENSE`;

console.log(downloadUrl);

let progressBar = null;
function onProgress(deltaBytes, totalBytes) {
  if (totalBytes === null) return;
  if (!progressBar) {
    progressBar = new ProgressBar(`Downloading ffmpeg ${releaseName} [:bar] :percent :etas `, {
      complete: '|',
      incomplete: ' ',
      width: 20,
      total: totalBytes,
    });
  }

  progressBar.tick(deltaBytes);
}

downloadFile(downloadUrl, ffmpegPath, onProgress)
  .then(() => {
    fs.chmodSync(ffmpegPath, 0o755); // make executable
  })
  .catch(exitOnError)

// .then(() => downloadFile(readmeUrl, `${ffmpegPath}.README`))
// .catch(exitOnErrorOrWarnWith('Failed to download the ffmpeg README.'))

  .then(() => downloadFile(licenseUrl, `${ffmpegPath}.LICENSE`))
  .catch(exitOnErrorOrWarnWith('Failed to download the ffmpeg LICENSE.'));
