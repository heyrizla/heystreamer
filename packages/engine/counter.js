module.exports = (incEv, decEv, idFn, onPositive, onZero, timeout) => {
  const counter = {};
  const timeouts = {};

  console.log(this);

  this.on(incEv, (hash, idx) => {
    const id = idFn(hash, idx);
    if (!counter.hasOwnProperty(id)) {
      counter[id] = 0;
      onPositive(hash, idx);
    }

    counter[id]++;

    if (timeouts[id]) {
      clearTimeout(timeouts[id]);
      delete timeouts[id];
    }
    console.log(counter[id]);
  });

  this.on(decEv, (hash, idx) => {
    const id = idFn(hash, idx);
    counter[id]--;
    console.log(counter[id]);
    if (counter[id] === 0) {
      if (timeouts[id]) clearTimeout(timeouts[id]);
      timeouts[id] = setTimeout(function() {
        onZero(hash, idx);
        delete counter[id];
        delete timeouts[id];
      }, timeout);
    }
  });
};
