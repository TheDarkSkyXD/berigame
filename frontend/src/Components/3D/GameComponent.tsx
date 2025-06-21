import { Canvas } from "@react-three/fiber";
import React, { useState, Suspense } from "react";
import CameraController from "./CameraController";
import RenderGLB from "./RenderGLB";
import GroundPlane from "../../Objects/GroundPlane";
import PlayerController from "./PlayerController";
import RenderOnlineUsers from "./RenderOnlineUsers";
import Api from "../Api";
import RenderNPC from "./RenderNPC";
import AlphaIsland from "./AlphaIsland";
import ClickDropdown from "../ClickDropdown";
import { useChatStore, useUserInputStore, useLoadingStore } from "../../store";
import UIComponents from "../UIComponents";
import BerryTree from "./BerryTree";
import LoadingScreen from "../LoadingScreen";

// react three fiber docs
// https://docs.pmnd.rs/react-three-fiber/api/objects

const GameComponent = () => {
  const [playerRef, setPlayerRef] = useState<any>();
  const clickedOtherObject = useUserInputStore(
    (state: any) => state.clickedOtherObject
  );
  const { isLoading } = useLoadingStore();

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <LoadingScreen />
      <Api />
      <UIComponents/>
      {clickedOtherObject && <ClickDropdown />}
      <Canvas
        id="three-canvas"
        resize={{ scroll: true, debounce: { scroll: 50, resize: 0 } }}
      >
        <Suspense fallback={null}>
          <AlphaIsland />
          <BerryTree position={[15, 0, 5]} treeId="tree_strawberry" berryType="strawberry" />
          <BerryTree position={[5, 0, 10]} treeId="tree_greenberry" berryType="greenberry" />
          <BerryTree position={[-5, 0, 5]} treeId="tree_goldberry" berryType="goldberry" />
          <RenderNPC isCombatable={false} />
          <RenderOnlineUsers />
          <PlayerController
            setPlayerRef={setPlayerRef}
          />
          <CameraController playerRef={playerRef} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default GameComponent;