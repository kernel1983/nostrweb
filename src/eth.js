import { ethers } from "ethers"
import createHash from 'create-hash'
import * as secp256k1 from '@noble/secp256k1'
import { Buffer } from 'buffer'
// import { toUtf8Bytes } from "@ethersproject/strings";
// import { arrayify, hexlify } from "@ethersproject/bytes";


export function generatePrivateKey() {
  return Buffer.from(secp256k1.utils.randomPrivateKey()).toString('hex')
}

export function getPublicKey(privateKey) {
  const sk = new ethers.utils.SigningKey( '0x'+privateKey )
  return ethers.utils.computeAddress(sk.publicKey)
}

export function verifySignature(event) {
  return secp256k1.schnorr.verify(event.sig, event.id, event.pubkey)
}

export function serializeEvent(evt) {
  return JSON.stringify([
    0,
    evt.pubkey,
    evt.created_at,
    evt.kind,
    evt.tags,
    evt.content
  ])
}

export function getEventHash(event) {
  let eventHash = createHash('sha256')
    .update(Buffer.from(serializeEvent(event)))
    .digest()
  // console.log('str hash', Buffer.from(eventHash).toString('hex'));
  // console.log('eth hash', ethers.hashMessage(serializeEvent(event)).replace('0x', ''));
  return Buffer.from(eventHash).toString('hex')
  // return ethers.hashMessage(serializeEvent(event))
}

export async function signEvent(event, key) {
  console.log(event);
  console.log('key', key);
  const sk = new ethers.SigningKey( '0x'+key );
  // return Buffer.from(
  //   await secp256k1.schnorr.sign(getEventHash(event), key)
  // ).toString('hex')
  // console.log('sk', sk);
  const hexdigest = getEventHash(event);
  console.log('hexdigest', hexdigest);
  const sig = sk.sign('0x'+hexdigest);
  // sig.v = 1
  console.log('sig', sig.serialized);
  // debugger
  return sig.serialized;
}
