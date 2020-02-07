module.exports.streamShouldTransmux = ({ codecType, codecName }, supportsHevc) => {
  const name = codec_name.toLowerCase();
  if (codecName === 'video') {
    return name.indexOf('h264') !== -1 || (supportsHevc && name.indexOf('hevc'));
  }

  if (codecType === 'audio') {
    // WARNING: NOTE: Safari / Apple stuff DO support AC3 ; we cannot enable it though as it's not universally supported
    return name.indexOf('aac') !== -1;
  }
};

module.exports.toSecs = ms => {
  return (ms / 1000).toFixed(3);
};

module.exports.handleErr = (err, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.writeHead(err.httpCode || 500);
  res.end(err.message || (err.toString ? err.toString() : 'internal server error'));
};
