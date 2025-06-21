import React, { useEffect, useState } from "react";
import { useLoadingStore } from "../store";

const LoadingScreen = () => {
  const { isLoading, loadingProgress, loadingMessage } = useLoadingStore();
  const [dots, setDots] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  // Animate loading dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === "...") return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Handle fade out when loading is complete
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 500); // Fade out after 500ms
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!isVisible) return null;

  return (
    <div className={`loading-screen ${!isLoading ? 'fade-out' : ''}`}>
      <div className="loading-content">
        <div className="loading-logo">
          <h1 className="game-title">BeriGame</h1>
          <p className="game-subtitle">Alpha Demo</p>
        </div>
        
        <div className="loading-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${loadingProgress * 100}%` }}
            />
          </div>
          <div className="progress-text">
            {Math.round(loadingProgress * 100)}%
          </div>
        </div>
        
        <div className="loading-message">
          {loadingMessage}{dots}
        </div>
        
        <div className="loading-tips">
          <p>💡 Tip: Click on the ground to move your character</p>
          <p>🌳 Tip: Click on trees to harvest berries</p>
          <p>💬 Tip: Use the chat to communicate with other players</p>
        </div>
      </div>
      
      <div className="loading-background">
        <div className="floating-particle particle-1"></div>
        <div className="floating-particle particle-2"></div>
        <div className="floating-particle particle-3"></div>
        <div className="floating-particle particle-4"></div>
        <div className="floating-particle particle-5"></div>
      </div>
    </div>
  );
};

export default LoadingScreen;
