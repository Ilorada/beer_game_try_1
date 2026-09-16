import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { FinalResults, MyGameView, RoomSnapshot } from "./types";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Results from "./pages/Results";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [myView, setMyView] = useState<MyGameView | null>(null);
  const [results, setResults] = useState<FinalResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onRoomState(snapshot: RoomSnapshot) {
      setRoom(snapshot);
      if (snapshot.phase !== "in_progress") setMyView(null);
      if (snapshot.phase !== "finished") setResults(null);
    }
    function onGameState(view: MyGameView) {
      setMyView(view);
    }
    function onGameEnded(final: FinalResults) {
      setResults(final);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.on("game:state", onGameState);
    socket.on("game:ended", onGameEnded);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
      socket.off("game:state", onGameState);
      socket.off("game:ended", onGameEnded);
    };
  }, []);

  function showError(message: string) {
    setError(message);
    window.setTimeout(() => setError((cur) => (cur === message ? null : cur)), 5000);
  }

  return (
    <div className="app-shell">
      <div className="brand">
        <h1>🍺 Beer Game</h1>
        <span className="tagline">l'effet coup de fouet, en direct</span>
      </div>

      {!connected && <div className="error-banner">Connexion au serveur en cours…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!room && <Home onError={showError} />}
      {room && room.phase === "lobby" && (
        <Lobby room={room} myId={socket.id ?? ""} onError={showError} />
      )}
      {room && room.phase === "in_progress" && (
        <Game room={room} myView={myView} myId={socket.id ?? ""} onError={showError} />
      )}
      {room && room.phase === "finished" && results && (
        <Results room={room} results={results} />
      )}

      <div className="footer-note">
        Basé sur le Beer Distribution Game (MIT Sloan) — un classique pour illustrer le bullwhip
        effect dans les chaînes d'approvisionnement.
      </div>
    </div>
  );
}
