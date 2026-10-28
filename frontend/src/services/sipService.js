import {
  UserAgent,
  Registerer,
  RegistererState,
  Inviter,
  SessionState,
} from "sip.js";

const WS_SERVER = "wss://localhost:8089/ws";
const DOMAIN = "localhost";

const AUDIO_ONLY = {
  constraints: {
    audio: true,
    video: false,
  },
};

let userAgent = null;
let registerer = null;
let currentSession = null;
let remoteAudio = null;

const handlers = {};

export function setHandlers(newHandlers) {
  Object.assign(handlers, newHandlers);
}

export function setRemoteAudio(element) {
  remoteAudio = element;
}

function attachRemoteAudio(session) {
  const peerConnection =
    session.sessionDescriptionHandler?.peerConnection;

  if (!peerConnection || !remoteAudio) {
    return;
  }

  const stream = new MediaStream();

  peerConnection.getReceivers().forEach((receiver) => {
    if (receiver.track) {
      stream.addTrack(receiver.track);
    }
  });

  remoteAudio.srcObject = stream;

  remoteAudio.play().catch(() => {
    handlers.onError?.(
      "Audio playback was blocked. Try interacting with the page."
    );
  });
}

function wireSession(session) {
  session.stateChange.addListener((state) => {
    if (state === SessionState.Establishing) {
      handlers.onStatus?.("Connecting Call");
    }

    if (state === SessionState.Established) {
      attachRemoteAudio(session);
      handlers.onStatus?.("Connected");
    }

    if (state === SessionState.Terminated) {
      if (remoteAudio) {
        remoteAudio.srcObject = null;
      }

      if (currentSession === session) {
        currentSession = null;
      }

      handlers.onIncoming?.(null);
      handlers.onStatus?.("Call Ended");
    }
  });
}

export async function register(extension, password) {
  if (userAgent) {
    await disconnect();
  }

  handlers.onStatus?.("Connecting");

  const uri = UserAgent.makeURI(
    `sip:${extension}@${DOMAIN}`
  );

  if (!uri) {
    throw new Error("Invalid SIP address");
  }

  userAgent = new UserAgent({
    uri,
    authorizationUsername: extension,
    authorizationPassword: password,

    transportOptions: {
      server: WS_SERVER,
    },

    delegate: {
      onInvite: (invitation) => {
        if (currentSession) {
          invitation.reject();
          return;
        }

        currentSession = invitation;
        wireSession(invitation);

        handlers.onIncoming?.(
          invitation.remoteIdentity.uri.user
        );

        handlers.onStatus?.("Incoming Call");
      },

      onDisconnect: () => {
        handlers.onStatus?.("Disconnected");
      },
    },
  });

  await userAgent.start();

  registerer = new Registerer(userAgent);

  registerer.stateChange.addListener((state) => {
    if (state === RegistererState.Registered) {
      handlers.onStatus?.("Registered");
    }

    if (state === RegistererState.Unregistered) {
      handlers.onStatus?.("Disconnected");
    }
  });

  await registerer.register();
}

export async function call(extension) {
  if (!userAgent) {
    throw new Error("Register your extension first");
  }

  if (currentSession) {
    throw new Error("A call is already active");
  }

  const target = UserAgent.makeURI(
    `sip:${extension}@${DOMAIN}`
  );

  if (!target) {
    throw new Error("Invalid destination extension");
  }

  const inviter = new Inviter(userAgent, target, {
    sessionDescriptionHandlerOptions: AUDIO_ONLY,
  });

  currentSession = inviter;
  wireSession(inviter);

  handlers.onStatus?.("Calling");

  await inviter.invite({
    requestDelegate: {
      onReject: (response) => {
        handlers.onError?.(
          `Call rejected: ${response.message.statusCode} ` +
          `${response.message.reasonPhrase}`
        );
      },
    },
  });
}

export async function answer() {
  if (!currentSession) {
    throw new Error("No incoming call");
  }

  await currentSession.accept({
    sessionDescriptionHandlerOptions: AUDIO_ONLY,
  });
}

export async function reject() {
  if (!currentSession) {
    return;
  }

  if (currentSession instanceof Inviter) {
    throw new Error("Cannot reject an outgoing call");
  }

  await currentSession.reject();
}

export async function hangup() {
  const session = currentSession;

  if (!session) {
    return;
  }

  if (session.state === SessionState.Established) {
    await session.bye();
  } else if (session instanceof Inviter) {
    await session.cancel();
  } else {
    await session.reject();
  }
}

export async function disconnect() {
  const oldRegisterer = registerer;
  const oldUserAgent = userAgent;

  registerer = null;
  userAgent = null;
  currentSession = null;

  if (remoteAudio) {
    remoteAudio.srcObject = null;
  }

  if (oldRegisterer) {
    try {
      await oldRegisterer.unregister();
    } catch (error) {
      console.error("SIP unregister failed:", error);
    }
  }

  if (oldUserAgent) {
    await oldUserAgent.stop();
  }

  handlers.onIncoming?.(null);
  handlers.onStatus?.("Disconnected");
}