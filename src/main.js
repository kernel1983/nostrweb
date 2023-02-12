// import {relayPool, generatePrivateKey, getPublicKey, signEvent} from 'nostr-tools';
import {relayPool} from 'nostr-tools';
import {generatePrivateKey, getPublicKey, signEvent, getEventHash} from './eth.js';
import {bounce} from './utils.js';
import {zeroLeadingBitsCount} from './cryptoutils.js';
import {elem, parseTextContent} from './domutil.js';
import {dateTime, formatTime} from './timeutil.js';
// curl -H 'accept: application/nostr+json' https://relay.nostr.ch/

const pool = relayPool();
// pool.addRelay('wss://relay.nostr.info', {read: true, write: true});
// pool.addRelay('wss://relay.damus.io', {read: true, write: true});
// pool.addRelay('wss://relay.snort.social', {read: true, write: true});

// pool.addRelay('wss://relay.nostr.ch', {read: true, write: true});
// pool.addRelay('wss://nostr.openchain.fr', {read: true, write: true});
// pool.addRelay('wss://eden.nostr.land', {read: true, write: true});
// pool.addRelay('wss://nostr.einundzwanzig.space', {read: true, write: true});
// pool.addRelay('wss://relay.nostrich.de', {read: true, write: true});
// pool.addRelay('wss://nostr.cercatrova.me', {read: true, write: true});
pool.addRelay('ws://127.0.0.1:8002', {read: true, write: true});

function onEvent(evt, relay) {
  switch (evt.kind) {
    case 0:
      handleMetadata(evt, relay);
      break;
    case 1:
      handleTextNote(evt, relay);
      break;
    case 2:
      handleRecommendServer(evt, relay);
      break;
    case 3:
      // handleContactList(evt, relay);
      break;
    case 7:
      handleReaction(evt, relay);
    default:
      // console.log(`TODO: add support for event kind ${evt.kind}`/*, evt*/)
  }
}

let pubkey = localStorage.getItem('pub_key') || (() => {
  const privatekey = generatePrivateKey();
  const pubkey = getPublicKey(privatekey);
  localStorage.setItem('private_key', privatekey);
  localStorage.setItem('pub_key', pubkey);
  return pubkey;
})();

const subList = [];
const unSubAll = () => {
  subList.forEach(sub => sub.unsub());
  subList.length = 0;
};

window.addEventListener('popstate', (event) => {
  // console.log(`popstate path: ${location.pathname}, state: ${JSON.stringify(event.state)}`);
  unSubAll();
  if (event.state?.author) {
    subProfile(event.state.author);
    return;
  }
  if (event.state?.pubOrEvt) {
    subNoteAndProfile(event.state.pubOrEvt);
    return;
  }
  if (event.state?.eventId) {
    subTextNote(event.state.eventId);
    return;
  }
  sub24hFeed();
  showFeed();
});

switch(location.pathname) {
  case '/':
    history.pushState({}, '', '/');
    sub24hFeed();
    break;
  default:
    const pubOrEvt = location.pathname.slice(1);
    if (pubOrEvt.length === 64 && pubOrEvt.match(/^[0-9a-f]+$/)) {
      history.pushState({pubOrEvt}, '', `/${pubOrEvt}`);
      subNoteAndProfile(pubOrEvt);
    }
    break;
}

function sub24hFeed() {
  subList.push(pool.sub({
    cb: onEvent,
    filter: {
      kinds: [0, 1, 2, 7],
      // until: Math.floor(Date.now() * 0.001),
      since: Math.floor((Date.now() * 0.001) - (24 * 60 * 60)),
      limit: 450,
    }
  }));
}

function subNoteAndProfile(id) {
  subProfile(id);
  subTextNote(id);
}

function subTextNote(eventId) {
  subList.push(pool.sub({
    cb: (evt, relay) => {
      clearTextNoteDetail();
      showTextNoteDetail(evt, relay);
    },
    filter: {
      ids: [eventId],
      kinds: [1],
      limit: 1,
    }
  }));
}

function subProfile(pubkey) {
  subList.push(pool.sub({
    cb: (evt, relay) => {
      renderProfile(evt, relay);
      showProfileDetail();
    },
    filter: {
      authors: [pubkey],
      kinds: [0],
      limit: 1,
    }
  }));
  // get notes for profile
  subList.push(pool.sub({
    cb: (evt, relay) => {
      showTextNoteDetail(evt, relay);
      showProfileDetail();
    },
    filter: {
      authors: [pubkey],
      kinds: [1],
      limit: 450,
    }
  }));
}

const detailContainer = document.querySelector('#detail');
const profileContainer = document.querySelector('#profile');
const profileAbout = profileContainer.querySelector('.profile-about');
const profileName = profileContainer.querySelector('.profile-name');
const profilePubkey = profileContainer.querySelector('.profile-pubkey');
const profilePubkeyLabel = profileContainer.querySelector('.profile-pubkey-label');
const profileImage = profileContainer.querySelector('.profile-image');
const textNoteContainer = document.querySelector('#textnote');

function clearProfile() {
  profileAbout.textContent = '';
  profileName.textContent = '';
  profilePubkey.textContent = '';
  profilePubkeyLabel.hidden = true;
  profileImage.removeAttribute('src');
  profileImage.hidden = true;
}
function renderProfile(evt, relay) {
  profileContainer.dataset.pubkey = evt.pubkey;
  profilePubkey.textContent = evt.pubkey;
  profilePubkeyLabel.hidden = false;
  const content = parseContent(evt.content);
  if (content) {
    profileAbout.textContent = content.about;
    profileName.textContent = content.name;
    const noxyImg = validatePow(evt) && getNoxyUrl('data', content.picture, evt.id, relay);
    if (noxyImg) {
      profileImage.setAttribute('src', noxyImg);
      profileImage.hidden = false;
    }
  }
}

function showProfileDetail() {
  profileContainer.hidden = false;
  textNoteContainer.hidden = false;
  showDetail();
}

function clearTextNoteDetail() {
  textNoteContainer.replaceChildren([]);
}

function showTextNoteDetail(evt, relay) {
  if (!textNoteContainer.querySelector(`[data-id="${evt.id}"]`)) {
    textNoteContainer.append(createTextNote(evt, relay));
  }
  textNoteContainer.hidden = false;
  profileContainer.hidden = true;
  showDetail();
}

function showDetail() {
  feedContainer.hidden = true;
  detailContainer.hidden = false;
}

function showFeed() {
  feedContainer.hidden = false;
  detailContainer.hidden = true;
}

document.querySelector('label[for="feed"]').addEventListener('click', () => {
  if (location.pathname !== '/') {
    showFeed();
    history.pushState({}, '', '/');
    unSubAll();
    sub24hFeed();
  }
});

document.body.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  const pubkey = e.target.closest('[data-pubkey]')?.dataset.pubkey;
  const id = e.target.closest('[data-id]')?.dataset.id;
  const relay = e.target.closest('[data-relay]')?.dataset.relay;
  if (button && button.name === 'reply') {
    if (localStorage.getItem('reply_to') === id) {
      writeInput.blur();
      return;
    }
    appendReplyForm(button.closest('.buttons'));
    localStorage.setItem('reply_to', id);
    return;
  }
  if (button && button.name === 'star') {
    upvote(id, pubkey);
    return;
  }
  if (button && button.name === 'back') {
    hideNewMessage(true);
    return;
  }
  const username = e.target.closest('.mbox-username')
  if (username) {
    history.pushState({author: pubkey}, '', `/${pubkey}`);
    unSubAll();
    clearProfile();
    clearTextNoteDetail();
    subProfile(pubkey);
    showProfileDetail();
    return;
  }
  const eventTime = e.target.closest('.mbox-header time');
  if (eventTime) {
    history.pushState({eventId: id, relay}, '', `/${id}`);
    unSubAll();
    clearTextNoteDetail();
    subTextNote(id);
    return;
  }
  // const container = e.target.closest('[data-append]');
  // if (container) {
  //   container.append(...parseTextContent(container.dataset.append));
  //   delete container.dataset.append;
  //   return;
  // }
});

const textNoteList = []; // could use indexDB
const eventRelayMap = {}; // eventId: [relay1, relay2]

const hasEventTag = tag => tag[0] === 'e';
const isReply = ([tag, , , marker]) => tag === 'e' && marker !== 'mention';
const isMention = ([tag, , , marker]) => tag === 'e' && marker === 'mention';

const renderFeed = bounce(() => {
  const now = Math.floor(Date.now() * 0.001);
  const sortedFeeds = textNoteList
    // dont render notes from the future
    .filter(note => note.created_at <= now)
    // if difficulty filter is configured dont render notes with too little pow
    .filter(note => {
      return !fitlerDifficulty || note.tags.some(([tag, , commitment]) => {
        return tag === 'nonce' && commitment >= fitlerDifficulty && zeroLeadingBitsCount(note.id) >= fitlerDifficulty;
      });
    })
    .sort(sortByCreatedAt).reverse();
  sortedFeeds.forEach((evt, i) => {
    if (feedDomMap[evt.id]) {
      // TODO check eventRelayMap if event was published to different relays
      return;
    }
    const article = createTextNote(evt, eventRelayMap[evt.id]);
    if (i === 0) {
      feedContainer.append(article);
    } else {
      feedDomMap[sortedFeeds[i - 1].id].before(article);
    }
    feedDomMap[evt.id] = article;
  });
}, 17); // (16.666 rounded, a bit arbitrary but that it doesnt update more than 60x per s)

function handleTextNote(evt, relay) {
  if (eventRelayMap[evt.id]) {
    eventRelayMap[evt.id] = [relay, ...(eventRelayMap[evt.id])];
  } else {
    eventRelayMap[evt.id] = [relay];
    if (evt.tags.some(hasEventTag)) {
      handleReply(evt, relay);
    } else {
      textNoteList.push(evt);
    }
    renderFeed();
  }
}

const replyList = [];
const replyDomMap = {};
const replyToMap = {};

function handleReply(evt, relay) {
  if (
    replyDomMap[evt.id] // already rendered probably received from another relay
    || evt.tags.some(isMention) // ignore mentions for now
  ) {
    return;
  }
  if (!replyToMap[evt.id]) {
    replyToMap[evt.id] = getReplyTo(evt);
  }
  replyList.push({
    replyTo: replyToMap[evt.id],
    ...evt,
  });
  renderReply(evt, relay);
}

const reactionMap = {};

const getReactionList = (id) => {
  return reactionMap[id]?.map(({content}) => content) || [];
};

function handleReaction(evt, relay) {
  // last id is the note that is being reacted to https://github.com/nostr-protocol/nips/blob/master/25.md
  const lastEventTag = evt.tags.filter(hasEventTag).at(-1);
  if (!lastEventTag || !evt.content.length) {
    // ignore reactions with no content
    return;
  }
  const [, eventId] = lastEventTag;
  if (reactionMap[eventId]) {
    if (reactionMap[eventId].find(reaction => reaction.id === evt.id)) {
      // already received this reaction from a different relay
      return;
    }
    reactionMap[eventId] = [evt, ...(reactionMap[eventId])];
  } else {
    reactionMap[eventId] = [evt];
  }
  const article = feedDomMap[eventId] || replyDomMap[eventId];
  if (article) {
    const button = article.querySelector('button[name="star"]');
    const reactions = button.querySelector('[data-reactions]');
    reactions.textContent = reactionMap[eventId].length;
    if (evt.pubkey === pubkey) {
      const star = button.querySelector('img[src*="star"]');
      star?.setAttribute('src', 'assets/star-fill.svg');
      star?.setAttribute('title', getReactionList(eventId).join(' '));
    }
  }
}

// feed
const feedContainer = document.querySelector('#homefeed');
const feedDomMap = {};
const restoredReplyTo = localStorage.getItem('reply_to');

const sortByCreatedAt = (evt1, evt2) => {
  if (evt1.created_at ===  evt2.created_at) {
    // console.log('TODO: OMG exactly at the same time, figure out how to sort then', evt1, evt2);
  }
  return evt1.created_at > evt2.created_at ? -1 : 1;
};

function rerenderFeed() {
  Object.keys(feedDomMap).forEach(key => delete feedDomMap[key]);
  Object.keys(replyDomMap).forEach(key => delete replyDomMap[key]);
  feedContainer.replaceChildren([]);
  renderFeed();
}

setInterval(() => {
  document.querySelectorAll('time[datetime]').forEach(timeElem => {
    timeElem.textContent = formatTime(new Date(timeElem.dateTime));
  });
}, 10000);

const getNoxyUrl = (type, url, id, relay) => {
  if (!isHttpUrl(url)) {
    return false;
  }
  const link = new URL(`https://noxy.nostr.ch/${type}`);
  link.searchParams.set('id', id);
  link.searchParams.set('relay', relay);
  link.searchParams.set('url', url);
  return link;
}

const fetchQue = [];
let fetchPending;
const fetchNext = (href, id, relay) => {
  const noxy = getNoxyUrl('meta', href, id, relay);
  const previewId = noxy.searchParams.toString();
  if (fetchPending) {
    fetchQue.push({href, id, relay});
    return previewId;
  }
  fetchPending = fetch(noxy.href)
    .then(data => {
      if (data.status === 200) {
        return data.json();
      }
      // fetchQue.push({href, id, relay}); // could try one more time
      return Promise.reject(data);
    })
    .then(meta => {
      const container = document.getElementById(previewId);
      const content = [];
      if (meta.images[0]) {
        content.push(elem('img', {className: 'preview-image', loading: 'lazy', src: getNoxyUrl('data', meta.images[0], id, relay).href}));
      }
      if (meta.title) {
        content.push(elem('h2', {className: 'preview-title'}, meta.title));
      }
      if (meta.descr) {
        content.push(elem('p', {className: 'preview-descr'}, meta.descr))
      }
      if (content.length) {
        container.append(elem('a', {href, rel: 'noopener noreferrer', target: '_blank'}, content));
        container.classList.add('preview-loaded');
      }
    })
    .finally(() => {
      fetchPending = false;
      if (fetchQue.length) {
        const {href, id, relay} = fetchQue.shift();
        return fetchNext(href, id, relay);
      }
    })
    .catch(err => err.text && err.text())
    .then(errMsg => errMsg && console.warn(errMsg));
  return previewId;
};

function linkPreview(href, id, relay) {
  if ((/\.(gif|jpe?g|png)$/i).test(href)) {
    return elem('div', {},
      [elem('img', {className: 'preview-image-only', loading: 'lazy', src: getNoxyUrl('data', href, id, relay).href})]
    );
  }
  const previewId = fetchNext(href, id, relay);
  return elem('div', {
    className: 'preview',
    id: previewId
  });
}

function createTextNote(evt, relay) {
  const {host, img, name, time, userName} = getMetadata(evt, relay);
  const replies = replyList.filter(({replyTo}) => replyTo === evt.id);
  // const isLongContent = evt.content.trimRight().length > 280;
  // const content = isLongContent ? evt.content.slice(0, 280) : evt.content;
  const hasReactions = reactionMap[evt.id]?.length > 0;
  const didReact = hasReactions && !!reactionMap[evt.id].find(reaction => reaction.pubkey === pubkey);
  const replyFeed = replies[0] ? replies.sort(sortByCreatedAt).map(e => replyDomMap[e.id] = createTextNote(e, relay)) : [];
  const [content, {firstLink}] = parseTextContent(evt.content);
  const body = elem('div', {className: 'mbox-body'}, [
    elem('header', {
      className: 'mbox-header',
      title: `User: ${userName}\n${time}\n\nUser pubkey: ${evt.pubkey}\n\nRelay: ${host}\n\nEvent-id: ${evt.id}
      ${evt.tags.length ? `\nTags ${JSON.stringify(evt.tags)}\n` : ''}
      ${evt.content}`
    }, [
      elem('small', {}, [
        elem('strong', {className: `mbox-username${name ? ' mbox-kind0-name' : ''}`}, name || userName),
        ' ',
        elem('time', {dateTime: time.toISOString()}, formatTime(time)),
      ]),
    ]),
    elem('div', {/* data: isLongContent ? {append: evt.content.slice(280)} : null*/}, [
      ...content,
      (firstLink && validatePow(evt)) ? linkPreview(firstLink, evt.id, relay) : '',
    ]),
    elem('div', {className: 'buttons'}, [
      elem('button', {name: 'reply', type: 'button'}, [
        elem('img', {height: 24, width: 24, src: 'assets/comment.svg'})
      ]),
      elem('button', {name: 'star', type: 'button'}, [
        elem('img', {
          alt: didReact ? '✭' : '✩', // ♥
          height: 24, width: 24,
          src: `assets/${didReact ? 'star-fill' : 'star'}.svg`,
          title: getReactionList(evt.id).join(' '),
        }),
        elem('small', {data: {reactions: ''}}, hasReactions ? reactionMap[evt.id].length : ''),
      ]),
    ]),
  ]);
  if (restoredReplyTo === evt.id) {
    appendReplyForm(body.querySelector('.buttons'));
    requestAnimationFrame(() => updateElemHeight(writeInput));
  }
  return renderArticle([
    elem('div', {className: 'mbox-img'}, [img]), body,
    replies[0] ? elem('div', {className: 'mobx-replies'}, replyFeed.reverse()) : '',
  ], {data: {id: evt.id, pubkey: evt.pubkey, relay}});
}

function renderReply(evt, relay) {
  const replyToId = replyToMap[evt.id];
  const article = feedDomMap[replyToId] || replyDomMap[replyToId];
  if (!article) { // root article has not been rendered
    return;
  }
  let replyContainer = article.querySelector('.mobx-replies');
  if (!replyContainer) {
    replyContainer = elem('div', {className: 'mobx-replies'});
    article.append(replyContainer);
  }
  const reply = createTextNote(evt, relay);
  replyContainer.append(reply);
  replyDomMap[evt.id] = reply;
}

const sortEventCreatedAt = (created_at) => (
  {created_at: a},
  {created_at: b},
) => (
  Math.abs(a - created_at) < Math.abs(b - created_at) ? -1 : 1
);

function isWssUrl(string) {
  try {
    return 'wss:' === new URL(string).protocol;
  } catch (err) {
    return false;
  }
}

function handleRecommendServer(evt, relay) {
  if (feedDomMap[evt.id] || !isWssUrl(evt.content)) {
    return;
  }
  const art = renderRecommendServer(evt, relay);
  if (textNoteList.length < 2) {
    feedContainer.append(art);
  } else {
    const closestTextNotes = textNoteList
      .filter(note => !fitlerDifficulty || note.tags.some(([tag, , commitment]) => tag === 'nonce' && commitment >= fitlerDifficulty))
      .sort(sortEventCreatedAt(evt.created_at));
    feedDomMap[closestTextNotes[0].id]?.after(art); // TODO: note might not be in the dom yet, recommendedServers could be controlled by renderFeed
  }
  feedDomMap[evt.id] = art;
}

function handleContactList(evt, relay) {
  if (feedDomMap[evt.id]) {
    return;
  }
  const art = renderUpdateContact(evt, relay);
  if (textNoteList.length < 2) {
    feedContainer.append(art);
    return;
  }
  const closestTextNotes = textNoteList.sort(sortEventCreatedAt(evt.created_at));
  feedDomMap[closestTextNotes[0].id].after(art);
  feedDomMap[evt.id] = art;
  // const user = userList.find(u => u.pupkey === evt.pubkey);
  // if (user) {
  //   console.log(`TODO: add contact list for ${evt.pubkey.slice(0, 8)} on ${relay}`, evt.tags);
  // } else {
  //   tempContactList[relay] = tempContactList[relay]
  //     ? [...tempContactList[relay], evt]
  //     : [evt];
  // }
}

function renderUpdateContact(evt, relay) {
  const {img, time, userName} = getMetadata(evt, relay);
  const body = elem('div', {className: 'mbox-body', title: dateTime.format(time)}, [
    elem('header', {className: 'mbox-header'}, [
      elem('small', {}, [
        
      ]),
    ]),
    elem('pre', {title: JSON.stringify(evt.content)}, [
      elem('strong', {}, userName),
      ' updated contacts: ',
      JSON.stringify(evt.tags),
    ]),
  ]);
  return renderArticle([img, body], {className: 'mbox-updated-contact', data: {id: evt.id, pubkey: evt.pubkey, relay}});
}

function renderRecommendServer(evt, relay) {
  const {img, name, time, userName} = getMetadata(evt, relay);
  const body = elem('div', {className: 'mbox-body', title: dateTime.format(time)}, [
    elem('header', {className: 'mbox-header'}, [
      elem('small', {}, [
        elem('strong', {}, userName)
      ]),
    ]),
    ` recommends server: ${evt.content}`,
  ]);
  return renderArticle([
    elem('div', {className: 'mbox-img'}, [img]), body
  ], {className: 'mbox-recommend-server', data: {id: evt.id, pubkey: evt.pubkey}});
}

function renderArticle(content, props = {}) {
  const className = props.className ? ['mbox', props?.className].join(' ') : 'mbox';
  return elem('article', {...props, className}, content);
}

const userList = [];
// const tempContactList = {};

function parseContent(content) {
  try {
    return JSON.parse(content);
  } catch(err) {
    console.log(evt);
    console.error(err);
  }
}

function handleMetadata(evt, relay) {
  const content = parseContent(evt.content);
  if (content) {
    setMetadata(evt, relay, content);
  }
}

function setMetadata(evt, relay, content) {
  let user = userList.find(u => u.pubkey === evt.pubkey);
  const picture = getNoxyUrl('data', content.picture, evt.id, relay).href;
  if (!user) {
    user = {
      metadata: {[relay]: content},
      ...(content.picture && {picture}),
      pubkey: evt.pubkey,
    };
    userList.push(user);
  } else {
    user.metadata[relay] = {
      ...user.metadata[relay],
      timestamp: evt.created_at,
      ...content,
    };
    // use only the first profile pic (for now), different pics on each releay are not supported yet
    if (!user.picture) {
      user.picture = picture;
    }
  }
  // update profile images
  if (user.picture && validatePow(evt)) {
    document.body
      .querySelectorAll(`canvas[data-pubkey="${evt.pubkey}"]`)
      .forEach(canvas => (canvas.parentNode.replaceChild(elem('img', {src: user.picture}), canvas)));
  }
  if (user.metadata[relay].name) {
    document.body
      .querySelectorAll(`[data-id="${evt.pubkey}"] .mbox-username:not(.mbox-kind0-name)`)
      .forEach(username => {
        username.textContent = user.metadata[relay].name;
        username.classList.add('mbox-kind0-name');
      });
  }
  // if (tempContactList[relay]) {
  //   const updates = tempContactList[relay].filter(update => update.pubkey === evt.pubkey);
  //   if (updates) {
  //     console.log('TODO: add contact list (kind 3)', updates);
  //   }
  // }
}

function isHttpUrl(string) {
  try {
    return ['http:', 'https:'].includes(new URL(string).protocol);
  } catch (err) {
    return false;
  }
}

const getHost = (url) => {
  try {
    return new URL(url).host;
  } catch(err) {
    return err;
  }
}

const elemCanvas = (text) => {
  const canvas = elem('canvas', {height: 80, width: 80, data: {pubkey: text}});
  const context = canvas.getContext('2d');
  const color = `#${text.slice(0, 6)}`;
  context.fillStyle = color;
  context.fillRect(0, 0, 80, 80);
  context.fillStyle = '#111';
  context.fillRect(0, 50, 80, 32);
  context.font = 'bold 18px monospace';
  if (color === '#000000') {
    context.fillStyle = '#fff';
  }
  context.fillText(text.slice(0, 8), 2, 46);
  return canvas;
}

function getMetadata(evt, relay) {
  const host = getHost(relay);
  const user = userList.find(user => user.pubkey === evt.pubkey);
  const userImg = user?.picture;
  const name = user?.metadata[relay]?.name;
  const userName = name || evt.pubkey.slice(0, 8);
  const userAbout = user?.metadata[relay]?.about || '';
  const img = (userImg && validatePow(evt)) ? elem('img', {
    alt: `${userName} ${host}`,
    loading: 'lazy',
    src: userImg,
    title: `${userName} on ${host} ${userAbout}`,
  }) : elemCanvas(evt.pubkey);
  const isReply = !!replyToMap[evt.id];
  const time = new Date(evt.created_at * 1000);
  return {host, img, isReply, name, time, userName};
}

/**
 * find reply-to ID according to nip-10, find marked reply or root tag or
 * fallback to positional (last) e tag or return null
 * @param {event} evt
 * @returns replyToID | null
 */
function getReplyTo(evt) {
  const eventTags = evt.tags.filter(isReply);
  const withReplyMarker = eventTags.filter(([, , , marker]) => marker === 'reply');
  if (withReplyMarker.length === 1) {
    return withReplyMarker[0][1];
  }
  const withRootMarker = eventTags.filter(([, , , marker]) => marker === 'root');
  if (withReplyMarker.length === 0 && withRootMarker.length === 1) {
    return withRootMarker[0][1];
  }
  // fallback to deprecated positional 'e' tags (nip-10)
  return eventTags.length ? eventTags.at(-1)[1] : null;
}

const writeForm = document.querySelector('#writeForm');
const writeInput = document.querySelector('textarea[name="message"]');

const elemShrink = () => {
  const height = writeInput.style.height || writeInput.getBoundingClientRect().height;
  const shrink = elem('div', {className: 'shrink-out'});
  shrink.style.height = `${height}px`;
  shrink.addEventListener('animationend', () => shrink.remove(), {once: true});
  return shrink;
}

writeInput.addEventListener('focusout', () => {
  const reply_to = localStorage.getItem('reply_to');
  if (reply_to && writeInput.value === '') {
    writeInput.addEventListener('transitionend', (event) => {
      if (!reply_to || reply_to === localStorage.getItem('reply_to') && !writeInput.style.height) { // should prob use some class or data-attr instead of relying on height
        writeForm.after(elemShrink());
        writeForm.remove();
        localStorage.removeItem('reply_to');
      }
    }, {once: true});
  }
});

function appendReplyForm(el) {
  writeForm.before(elemShrink());
  writeInput.blur();
  writeInput.style.removeProperty('height');
  el.after(writeForm);
  if (writeInput.value && !writeInput.value.trimRight()) {
    writeInput.value = '';
  } else {
    requestAnimationFrame(() => updateElemHeight(writeInput));
  }
  requestAnimationFrame(() => writeInput.focus());
}

const lockScroll = () => document.body.style.overflow = 'hidden';
const unlockScroll = () => document.body.style.removeProperty('overflow');

const newMessageDiv = document.querySelector('#newMessage');
document.querySelector('#bubble').addEventListener('click', (e) => {
  localStorage.removeItem('reply_to'); // should it forget old replyto context?
  newMessageDiv.prepend(writeForm);
  hideNewMessage(false);
  writeInput.focus();
  if (writeInput.value.trimRight()) {
    writeInput.style.removeProperty('height');
  }
  lockScroll();
  requestAnimationFrame(() => updateElemHeight(writeInput));
});

document.body.addEventListener('keyup', (e) => {
  if (e.key === 'Escape') {
    hideNewMessage(true);
  }
});

function hideNewMessage(hide) {
  unlockScroll();
  newMessageDiv.hidden = hide;
}

let fitlerDifficulty = JSON.parse(localStorage.getItem('filter_difficulty')) ?? 0;
const filterDifficultyInput = document.querySelector('#filterDifficulty');
const filterDifficultyDisplay = document.querySelector('[data-display="filter_difficulty"]');
filterDifficultyInput.addEventListener('input', (e) => {
  localStorage.setItem('filter_difficulty', filterDifficultyInput.valueAsNumber);
  fitlerDifficulty = filterDifficultyInput.valueAsNumber;
  filterDifficultyDisplay.textContent = filterDifficultyInput.value;
  rerenderFeed();
});
filterDifficultyInput.value = fitlerDifficulty;
filterDifficultyDisplay.textContent = filterDifficultyInput.value;

// arbitrary difficulty default, still experimenting.
let difficulty = JSON.parse(localStorage.getItem('mining_target')) ?? 16;
const miningTargetInput = document.querySelector('#miningTarget');
miningTargetInput.addEventListener('input', (e) => {
  localStorage.setItem('mining_target', miningTargetInput.valueAsNumber);
  difficulty = miningTargetInput.valueAsNumber;
});
miningTargetInput.value = difficulty;

let timeout = JSON.parse(localStorage.getItem('mining_timeout')) ?? 5;
const miningTimeoutInput = document.querySelector('#miningTimeout');
miningTimeoutInput.addEventListener('input', (e) => {
  localStorage.setItem('mining_timeout', miningTimeoutInput.valueAsNumber);
  timeout = miningTimeoutInput.valueAsNumber;
});
miningTimeoutInput.value = timeout;

async function upvote(eventId, eventPubkey) {
  const note = replyList.find(r => r.id === eventId) || textNoteList.find(n => n.id === (eventId));
  const tags = [
    ...note.tags
      .filter(tag => ['e', 'p'].includes(tag[0])) // take e and p tags from event
      .map(([a, b]) => [a, b]), // drop optional (nip-10) relay and marker fields
    ['e', eventId], ['p', eventPubkey], // last e and p tag is the id and pubkey of the note being reacted to (nip-25)
  ];
  const article = (feedDomMap[eventId] || replyDomMap[eventId]);
  const reactionBtn = article.querySelector('[name="star"]');
  const statusElem = article.querySelector('[data-reactions]');
  reactionBtn.disabled = true;
  const newReaction = await powEvent({
    kind: 7,
    pubkey, // TODO: lib could check that this is the pubkey of the key to sign with
    content: '+',
    tags,
    created_at: Math.floor(Date.now() * 0.001),
  }, {difficulty, statusElem, timeout}).catch(console.warn);
  if (!newReaction) {
    statusElem.textContent = reactionMap[eventId]?.length;
    reactionBtn.disabled = false;
    return;
  }
  const privatekey = localStorage.getItem('private_key');
  const sig = await signEvent(newReaction, privatekey).catch(console.error);
  if (sig) {
    statusElem.textContent = 'publishing…';
    const ev = await pool.publish({...newReaction, sig}, (status, url) => {
      if (status === 0) {
        console.info(`publish request sent to ${url}`);
      }
      if (status === 1) {
        console.info(`event published by ${url}`);
      }
    }).catch(console.error);
    reactionBtn.disabled = false;
  }
}

// send
const sendStatus = document.querySelector('#sendstatus');
const onSendError = err => sendStatus.textContent = err.message;
const publish = document.querySelector('#publish');
writeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  // const pubkey = localStorage.getItem('pub_key');
  const privatekey = localStorage.getItem('private_key');
  if (!pubkey || !privatekey) {
    return onSendError(new Error('no pubkey/privatekey'));
  }
  const content = writeInput.value.trimRight();
  if (!content) {
    return onSendError(new Error('message is empty'));
  }
  const replyTo = localStorage.getItem('reply_to');
  const close = () => {
    sendStatus.textContent = '';
    writeInput.value = '';
    writeInput.style.removeProperty('height');
    publish.disabled = true;
    if (replyTo) {
      localStorage.removeItem('reply_to');
      newMessageDiv.append(writeForm);
    }
    hideNewMessage(true);
  };
  const tags = replyTo ? [['e', replyTo, eventRelayMap[replyTo][0]]] : [];
  // const newEvent = await powEvent({
  //   kind: 1,
  //   content,
  //   pubkey,
  //   tags,
  //   created_at: Math.floor(Date.now() * 0.001),
  // }, {difficulty, statusElem: sendStatus, timeout}).catch(console.warn);
  const newEvent = {
    kind: 1,
    content,
    pubkey,
    tags,
    created_at: Math.floor(Date.now() * 0.001),
  };
  // newEvent.id = getEventHash(newEvent).replace('0x', '');
  // console.log('newEvent.id', newEvent.id);
  if (!newEvent) {
    close();
    return;
  }
  const sig = await signEvent(newEvent, privatekey).catch(onSendError);
  if (sig) {
    sendStatus.textContent = 'publishing…';
    const ev = await pool.publish({...newEvent, sig}, (status, url) => {
      if (status === 0) {
        console.info(`publish request sent to ${url}`);
      }
      if (status === 1) {
        close();
        // console.info(`event published by ${url}`, ev);
      }
    });
  }
});

writeInput.addEventListener('input', () => {
  publish.disabled = !writeInput.value.trimRight();
  updateElemHeight(writeInput);
});
writeInput.addEventListener('blur', () => sendStatus.textContent = '');

function updateElemHeight(el) {
  el.style.removeProperty('height');
  if (el.value) {
    el.style.paddingBottom = 0;
    el.style.paddingTop = 0;
    el.style.height = el.scrollHeight + 'px';
    el.style.removeProperty('padding-bottom');
    el.style.removeProperty('padding-top');
  }
}

// settings
const settingsForm = document.querySelector('form[name="settings"]');
const privateKeyInput = settingsForm.querySelector('#privatekey');
const pubKeyInput = settingsForm.querySelector('#pubkey');
const statusMessage = settingsForm.querySelector('#keystatus');
const generateBtn = settingsForm.querySelector('button[name="generate"]');
const importBtn = settingsForm.querySelector('button[name="import"]');
const privateTgl = settingsForm.querySelector('button[name="privatekey-toggle"]');

generateBtn.addEventListener('click', () => {
  const privatekey = generatePrivateKey();
  const pubkey = getPublicKey(privatekey);
  if (validKeys(privatekey, pubkey)) {
    privateKeyInput.value = privatekey;
    pubKeyInput.value = pubkey;
    statusMessage.textContent = 'private-key created!';
    statusMessage.hidden = false;
  }
});

importBtn.addEventListener('click', () => {
  const privatekey = privateKeyInput.value;
  const pubkeyInput = pubKeyInput.value;
  if (validKeys(privatekey, pubkeyInput)) {
    localStorage.setItem('private_key', privatekey);
    localStorage.setItem('pub_key', pubkeyInput);
    statusMessage.textContent = 'stored private and public key locally!';
    statusMessage.hidden = false;
    pubkey = pubkeyInput;
  }
});

settingsForm.addEventListener('input', () => validKeys(privateKeyInput.value, pubKeyInput.value));
privateKeyInput.addEventListener('paste', (event) => {
  if (pubKeyInput.value || !event.clipboardData) {
    return;
  }
  if (privateKeyInput.value === '' || ( // either privatekey field is empty
    privateKeyInput.selectionStart === 0 // or the whole text is selected and replaced with the clipboard
    && privateKeyInput.selectionEnd === privateKeyInput.value.length
  )) { // only generate the pubkey if no data other than the text from clipboard will be used
    try {
      pubKeyInput.value = getPublicKey(event.clipboardData.getData('text'));
    } catch(err) {} // settings form will call validKeys on input and display the error
  }
});

function validKeys(privatekey, pubkey) {
  try {
    if (getPublicKey(privatekey) === pubkey) {
      statusMessage.hidden = true;
      statusMessage.textContent = 'public-key corresponds to private-key';
      importBtn.removeAttribute('disabled');
      return true;
    } else {
      statusMessage.textContent = 'private-key does not correspond to public-key!'
    }
  } catch (e) {
    statusMessage.textContent = `not a valid private-key: ${e.message || e}`;
  }
  statusMessage.hidden = false;
  importBtn.setAttribute('disabled', true);
  return false;
}

privateTgl.addEventListener('click', () => {
  privateKeyInput.type = privateKeyInput.type === 'text' ? 'password' : 'text';
});

privateKeyInput.value = localStorage.getItem('private_key');
pubKeyInput.value = localStorage.getItem('pub_key');

// profile
const profileForm = document.querySelector('form[name="profile"]');
const profileSubmit = profileForm.querySelector('button[type="submit"]');
const profileStatus = document.querySelector('#profilestatus');
const onProfileError = err => {
  profileStatus.hidden = false;
  profileStatus.textContent = err.message
};
profileForm.addEventListener('input', (e) => {
  if (e.target.nodeName === 'TEXTAREA') {
    updateElemHeight(e.target);
  }
  const form = new FormData(profileForm);
  const name = form.get('name');
  const about = form.get('about');
  const picture = form.get('picture');
  profileSubmit.disabled = !(name || about || picture);
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(profileForm);
  const newProfile = await powEvent({
    kind: 0,
    pubkey,
    content: JSON.stringify(Object.fromEntries(form)),
    tags: [],
    created_at: Math.floor(Date.now() * 0.001),
  }, {difficulty, statusElem: profileStatus, timeout}).catch(console.warn);
  if (!newProfile) {
    profileStatus.textContent = 'publishing profile data canceled';
    profileStatus.hidden = false;
    return;
  }
  const privatekey = localStorage.getItem('private_key');
  const sig = await signEvent(newProfile, privatekey).catch(console.error);
  if (sig) {
    const ev = await pool.publish({...newProfile, sig}, (status, url) => {
      if (status === 0) {
        console.info(`publish request sent to ${url}`);
      }
      if (status === 1) {
        profileStatus.textContent = 'profile metadata successfully published';
        profileStatus.hidden = false;
        profileSubmit.disabled = true;
      }
    }).catch(console.error);
  }
});

const errorOverlay = document.querySelector('#errorOverlay');

function promptError(error, options = {}) {
  const {onAgain, onCancel} = options;
  lockScroll();
  errorOverlay.replaceChildren(
    elem('h1', {className: 'error-title'}, error),
    elem('p', {}, 'time ran out finding a proof with the desired mining difficulty. either try again, lower the mining difficulty or increase the timeout in profile settings.'),
    elem('div', {className: 'buttons'}, [
      onCancel ? elem('button', {data: {action: 'close'}}, 'close') : '',
      onAgain ? elem('button', {data: {action: 'again'}}, 'try again') : '',
    ]),
  );
  const handleOverlayClick = (e) => {
    const button = e.target.closest('button');
    if (button) {
      switch(button.dataset.action) {
        case 'close':
          onCancel();
          break;
        case 'again':
          onAgain();
          break;
      }
      errorOverlay.removeEventListener('click', handleOverlayClick);
      errorOverlay.hidden = true;
      unlockScroll();
    }
  };
  errorOverlay.addEventListener('click', handleOverlayClick);
  errorOverlay.hidden = false;
}

/**
 * validate proof-of-work of a nostr event per nip-13.
 * the validation always requires difficulty commitment in the nonce tag.
 *
 * @param {EventObj} evt event to validate
 * TODO: @param {number} targetDifficulty target proof-of-work difficulty
 */
function validatePow(evt) {
  const tag = evt.tags.find(tag => tag[0] === 'nonce');
  if (!tag) {
    return false;
  }
  const difficultyCommitment = Number(tag[2]);
  if (!difficultyCommitment || Number.isNaN(difficultyCommitment)) {
    return false;
  }
  return zeroLeadingBitsCount(evt.id) >= difficultyCommitment;
}

/**
 * run proof of work in a worker until at least the specified difficulty.
 * if succcessful, the returned event contains the 'nonce' tag
 * and the updated created_at timestamp.
 *
 * powEvent returns a rejected promise if the funtion runs for longer than timeout.
 * a zero timeout makes mineEvent run without a time limit.
 * a zero mining target just resolves the promise without trying to find a 'nonce'.
 */
function powEvent(evt, options) {
  const {difficulty, statusElem, timeout} = options;
  if (difficulty === 0) {
    return Promise.resolve(evt);
  }
  const cancelBtn = elem('button', {className: 'btn-inline'}, [elem('small', {}, 'cancel')]);
  statusElem.replaceChildren('working…', cancelBtn);
  statusElem.hidden = false;
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js');

    const onCancel = () => {
      worker.terminate();
      reject('canceled');
    };
    cancelBtn.addEventListener('click', onCancel);

    worker.onmessage = (msg) => {
      worker.terminate();
      cancelBtn.removeEventListener('click', onCancel);
      if (msg.data.error) {
        promptError(msg.data.error, {
          onCancel: () => reject('canceled'),
          onAgain: async () => {
            const result = await powEvent(evt, {difficulty, statusElem, timeout}).catch(console.warn);
            resolve(result);
          }
        })
      } else {
        resolve(msg.data.event);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      cancelBtn.removeEventListener('click', onCancel);
      reject(err);
    };

    worker.postMessage({event: evt, difficulty, timeout});
  });
}
