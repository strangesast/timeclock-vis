import { Observable } from 'rxjs';

const DEFAULT_TIMEOUT_DURATION = 1000;

export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}
type FancyObservable<T> = Observable<T>&{socket:WebSocket};

type fn<T> = (s: string) => T;

function wrapSocketMessages<T>(
  socket: WebSocket,
  parser: fn<T> = (s: string) => JSON.parse(s),
): FancyObservable<T> {
  const observable = new Observable<T>(function (subscriber) {
    socket.addEventListener('close', socketClose);
    socket.addEventListener('message', socketMessage);
    socket.addEventListener('error', socketError);

    function socketClose (e: CloseEvent) {
      subscriber.complete();
    }
    function socketMessage (e: MessageEvent) {
      subscriber.next(parser(e.data));
    }
    function socketError (e: ErrorEvent) {
      subscriber.error(e.error);
      subscriber.complete();
    }
  });
  Object.assign(observable, {socket});
  return observable as FancyObservable<T>;
}

export function socket<T>(url, timeoutDuration = DEFAULT_TIMEOUT_DURATION, binary = false, parser?): Observable<FancyObservable<T>> {
  return new Observable(function (subscriber) {
    const socket = new WebSocket(url);

    if (binary) {
      socket.binaryType = 'arraybuffer';
    }

    socket.addEventListener('open', socketOpen);
    socket.addEventListener('close', socketClose);
    // socket.addEventListener('error',  socketError);

    const timeout = setTimeout(() => {
      if (!subscriber.closed) {
        socket.close();
        const err = new TimeoutError(`websocket connection timed out after ${timeoutDuration}.`);
        subscriber.error(err);
        clearListeners();
      }
    }, timeoutDuration);

    function socketOpen() {
      subscriber.next(wrapSocketMessages(socket, parser));
      subscriber.complete();
      clearTimeout(timeout);
      clearListeners();
    }

    function socketClose(e) {
      console.log('socket closed');
      clearTimeout(timeout);
      clearListeners();
      subscriber.error(new Error(`socket closed unexpectedly (code ${e.code})`));
      subscriber.complete();
    }

    // function socketError(e: ErrorEvent) {
    //   console.log('SocketError', e);
    //   subscriber.error(e);
    //   clearTimeout(timeout);
    // }

    function clearListeners() {
      socket.removeEventListener('open', socketOpen);
      socket.removeEventListener('close', socketClose);
      // socket.removeEventListener('error', socketError);
    }
  });
}
