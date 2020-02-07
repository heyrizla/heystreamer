module.exports = async ctx => {
  const { url } = ctx.query;
  let realUrl = url;
  if (!realUrl.match('://')) {
    realUrl = `https://localhost:${ctx.port}${realUrl}`;
  }

  const stats = await ctx.hls.probeVideo(realUrl);
  ctx.body = stats;
};
