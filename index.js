'use strict';

if (process.env.FFMPEG_BIN) {
  module.exports = process.env.FFMPEG_BIN;
} else {
  const os = require('os');
  const path = require('path');

  const binaries = Object.assign(Object.create(null), {
    darwin: [ 'x64', 'arm64' ],
    freebsd: [ 'x64' ],
    linux: [ 'x64', 'ia32', 'arm64', 'arm' ],
    win32: [ 'x64', 'ia32' ],
  });

  const platform = process.env.npm_config_platform || os.platform();
  const arch = process.env.npm_config_arch || os.arch();

  let ffmpegPath = path.resolve(
    __dirname,
    './bin',
    platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );

  if (!binaries[platform] || binaries[platform].indexOf(arch) === -1) {
    ffmpegPath = null;
  }

  module.exports = ffmpegPath;
}
