import { env } from 'process';
import { torrents } from './index';

export async function cleanupTorrents() {
  const timeoutMultiplier = torrents.size < 4 ? 5 : torrents.size < 6 ? 3 : 1;
  log(timeoutMultiplier);

  for (const [infoHash, engine] of torrents.entries()) {
    if (engine.clientCount > 0) {
      continue;
    }

    if (engine.lastClientDisconnect === -1) {
      continue;
    }

    const inactiveTime = Date.now() - engine.lastClientDisconnect;
    const shouldRemove =
      inactiveTime > +env.RECONNECT_TIMEOUT! * timeoutMultiplier;

    if (shouldRemove) {
      console.log(new Date(), 'engine-  ', infoHash);

      engine.remove(false, () => {});
      engine.destroy(() => {});
      torrents.delete(infoHash);
    }
  }
}

let wasLastLogHadZeroCount = false;
function log(timeoutMultiplier) {
  if (wasLastLogHadZeroCount && torrents.size === 0) return;
  wasLastLogHadZeroCount = torrents.size === 0;

  console.log(
    new Date(),
    'cleanup  ',
    'torrents count:',
    torrents.size,
    'timeout multiplier',
    timeoutMultiplier
  );
}
