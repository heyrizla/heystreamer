const Router = require('@koa/router');
const stream = require('./stream');
const createEngine = require('./createEngine');
const probeVideo = require('./probeVideo');

const router = new Router();

router.post('/:infoHash/:idx', createEngine);
router.get('/:infoHash/:idx', stream);
router.get('/probe', probeVideo);

module.exports = router;
