import { useEffect, useRef, useState } from "react";
import * as sip from "./services/sipService";

export default function App() {
  const [extension, setExtension] = useState("1001");
  const [password, setPassword] = useState("");
  const [destination, setDestination] = useState("1002");

  const [status, setStatus] = useState("Disconnected");
  const [incoming, setIncoming] = useState(null);
  const [error, setError] = useState("");

  const audioRef = useRef(null);

  useEffect(() => {
    sip.setRemoteAudio(audioRef.current);

    sip.setHandlers({
      onStatus: (value) => setStatus(value),
      onIncoming: (value) => setIncoming(value),
      onError: (message) => setError(message),
    });

    return () => {
      sip.disconnect().catch(console.error);
    };
  }, []);

  const run = (operation) => async () => {
    setError("");

    try {
      await operation();
    } catch (error) {
      setError(error.message || "An unexpected error occurred");
    }
  };

  return (
    <main className="container">
      <h1>SIP Practice Calling App</h1>

      <p>
        Status: <strong>{status}</strong>
      </p>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>SIP Registration</h2>

        <label>
          Extension
          <input
            value={extension}
            onChange={(event) =>
              setExtension(event.target.value)
            }
          />
        </label>

        <label>
          SIP Password
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />
        </label>

        <button
          onClick={run(() => sip.register(extension, password))}
        >
          Register
        </button>

        <button onClick={run(sip.disconnect)}>
          Disconnect
        </button>
      </section>

      <section>
        <h2>Make a Call</h2>

        <label>
          Destination Extension
          <input
            value={destination}
            onChange={(event) =>
              setDestination(event.target.value)
            }
          />
        </label>

        <button
          onClick={run(() => sip.call(destination))}
        >
          Call
        </button>

        <button onClick={run(sip.hangup)}>
          Hang Up
        </button>
      </section>

      {incoming && (
        <section>
          <h2>Incoming Call</h2>

          <p>
            Incoming call from <strong>{incoming}</strong>
          </p>

          <button onClick={run(sip.answer)}>
            Answer
          </button>

          <button onClick={run(sip.reject)}>
            Reject
          </button>
        </section>
      )}

      <audio ref={audioRef} autoPlay />
    </main>
  );
}