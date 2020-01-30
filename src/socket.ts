import { Observable } from 'rxjs';

const DEFAULT_TIMEOUT_DURATION = 1000;

export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}
type FancyObservable = Observable<string>&{socket:WebSocket};

function wrapSocketMessages(socket: WebSocket): FancyObservable {
  const observable = new Observable<string>(function (subscriber) {
    socket.addEventListener('close', socketClose);
    socket.addEventListener('message', socketMessage);
    socket.addEventListener('error', socketError);

    function socketClose (e: CloseEvent) {
      subscriber.complete();
    }
    function socketMessage (e: MessageEvent) {
      subscriber.next(e.data);
    }
    function socketError (e: ErrorEvent) {
      subscriber.error(e.error);
      subscriber.complete();
    }
  });
  Object.assign(observable, {socket});
  return observable as FancyObservable;
}

export function socket(url, timeoutDuration = DEFAULT_TIMEOUT_DURATION): Observable<FancyObservable> {
  return new Observable(function (subscriber) {
    const socket = new WebSocket(url);

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
      subscriber.next(wrapSocketMessages(socket));
      subscriber.complete();
      clearTimeout(timeout);
      clearListeners();
    }

    function socketClose(e) {
      // should never be called?
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
