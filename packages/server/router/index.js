const Router = require('@koa/router');
const stream = require('./stream');

const router = new Router();

router.get('/:infoHash/:idx', stream);

module.exports = router;
