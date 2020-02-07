module.exports = async ctx => {
  const { infoHash } = ctx.params;
  const engine = await ctx.engine.create(infoHash);
  const stats = await ctx.engine.getStatistics(engine);
  ctx.body = stats;
};
