/**
 * throttle and debounce given function in regular time interval,
 * but with the difference that the last call will be debounced and therefore never missed.
 * @param {*} function to throttle and debounce
 * @param {*} time desired interval to execute function
 * @returns callback
 */
export const bounce = (fn, time) => {
  let throttle;
  let debounce;
  return (/*...args*/) => {
    if (throttle) {
    	clearTimeout(debounce);
    	debounce = setTimeout(() => fn(/*...args*/), time);
      return;
    }
    fn(/*...args*/);
    throttle = setTimeout(() => {
      throttle = false;
    }, time);
  };
};
