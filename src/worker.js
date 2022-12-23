import {getEventHash} from 'nostr-tools';
import {zeroLeadingBitsCount} from './cryptoutils.js';

function mine(event, difficulty, timeout = 5) {
  const max = 256; // arbitrary
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > max) {
    throw new Error(`difficulty must be an integer between 0 and ${max}`);
  }
  // continue with mining
  let n = BigInt(0);
  event.tags.unshift(['nonce', n.toString(), `${difficulty}`]);

  const start = Math.floor(Date.now() * 0.001);
  console.time('pow');
  while (true) {
    const now = Math.floor(Date.now() * 0.001);
    // if (now > start + 15) {
    //   console.timeEnd('pow');
    //   return false;
    // }
    if (now !== event.created_at) {
      event.created_at = now;
      // n = BigInt(0); // could reset nonce as we have a new timestamp
    }
    event.tags[0][1] = (++n).toString();
    const id = getEventHash(event);
    if (zeroLeadingBitsCount(id) === difficulty) {
      console.log(event.tags[0][1], id);
      console.timeEnd('pow');
      return event;
    }
  }
}

addEventListener('message', async (msg) => {
  const {
    difficulty,
    event,
    timeout,
  } = msg.data;
  try {
    const minedEvent = mine(event, difficulty, timeout);
    postMessage({event: minedEvent});
  } catch (err) {
    postMessage({error: err});
  }
});