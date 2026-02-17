import React, { useState, useEffect, useRef } from 'react';

const BewilderPrototype = () => {
  const [phase, setPhase] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [particles, setParticles] = useState([]);
  const [glitching, setGlitching] = useState(false);
  const [inverted, setInverted] = useState(false);
  const [floatingElements, setFloatingElements] = useState([]);
  const [secretFound, setSecretFound] = useState(false);
  const [mouseTrail, setMouseTrail] = useState([]);
  const [gravity, setGravity] = useState('down');
  const [portalOpen, setPortalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [showEye, setShowEye] = useState(false);
  const containerRef = useRef(null);

  const messages = [
    "You clicked. Reality noticed.",
    "The boundaries are thinning...",
    "Do you feel it shifting?",
    "Nothing is as it seems.",
    "You're getting closer...",
    "The portal awaits.",
    "Reality is just a suggestion.",
    "You've been here before.",
    "Time is a flat circle.",
    "Welcome to the in-between."
  ];

  useEffect(() => {
    if (clicks > 0 && clicks % 3 === 0) {
      setGlitching(true);
      setTimeout(() => setGlitching(false), 500);
    }
    if (clicks === 7) setInverted(true);
    if (clicks === 15) setGravity('up');
    if (clicks === 20) setShowEye(true);
    if (clicks >= 5) setPhase(1);
    if (clicks >= 12) setPhase(2);
    if (clicks >= 20) setPhase(3);
  }, [clicks]);

  const spawnParticles = (x, y, count = 12) => {
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x,
      y,
      angle: (Math.PI * 2 * i) / count,
      speed: 2 + Math.random() * 4,
      size: 4 + Math.random() * 8,
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
      life: 1
    }));
    setParticles(prev => [...prev, ...newParticles]);
  };

  const spawnFloatingElement = (x, y) => {
    const shapes = ['◆', '◇', '○', '●', '△', '▽', '☆', '★', '✦', '✧', '⬡', '⬢'];
    const newElement = {
      id: Date.now(),
      x,
      y,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 1.5,
      color: `hsl(${260 + Math.random() * 60}, 70%, 60%)`,
      drift: (Math.random() - 0.5) * 2
    };
    setFloatingElements(prev => [...prev.slice(-30), newElement]);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev =>
        prev.map(p => ({
          ...p,
          x: p.x + Math.cos(p.angle) * p.speed,
          y: p.y + Math.sin(p.angle) * p.speed,
          life: p.life - 0.02,
          size: p.size * 0.98
        })).filter(p => p.life > 0)
      );

      setFloatingElements(prev =>
        prev.map(el => ({
          ...el,
          y: gravity === 'down' ? el.y + 0.5 : el.y - 0.5,
          x: el.x + el.drift,
          rotation: el.rotation + 1
        })).filter(el => el.y > -100 && el.y < window.innerHeight + 100)
      );
    }, 16);
    return () => clearInterval(interval);
  }, [gravity]);

  const handleClick = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left || 0);
    const y = e.clientY - (rect?.top || 0);

    setClicks(prev => prev + 1);
    spawnParticles(x, y);
    spawnFloatingElement(x, y);

    if (Math.random() > 0.6) {
      setMessage(messages[Math.floor(Math.random() * messages.length)]);
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const handleSecretClick = () => {
    setSecretFound(true);
    setPortalOpen(true);
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        spawnParticles(
          window.innerWidth / 2 + (Math.random() - 0.5) * 200,
          window.innerHeight / 2 + (Math.random() - 0.5) * 200,
          8
        );
      }, i * 50);
    }
  };

  const handleMouseMove = (e) => {
    if (phase >= 2) {
      setMouseTrail(prev => [...prev.slice(-20), {
        id: Date.now(),
        x: e.clientX,
        y: e.clientY
      }]);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      className={`relative w-full h-screen overflow-hidden cursor-crosshair select-none transition-all duration-1000 ${glitching ? 'animate-pulse' : ''}`}
      style={{
        background: inverted
          ? 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
          : phase >= 2
            ? 'linear-gradient(135deg, #0c0c1e 0%, #1a1a3e 50%, #2d1b4e 100%)'
            : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        filter: glitching ? 'hue-rotate(180deg)' : 'none',
        transform: gravity === 'up' ? 'rotate(180deg)' : 'none'
      }}
    >
      {/* Ambient floating shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-10 animate-pulse"
            style={{
              width: 100 + i * 20,
              height: 100 + i * 20,
              left: `${(i * 17) % 100}%`,
              top: `${(i * 23) % 100}%`,
              background: `radial-gradient(circle, ${inverted ? '#1a1a2e' : 'rgba(147, 112, 219, 0.3)'} 0%, transparent 70%)`,
              animation: `float ${5 + i}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`
            }}
          />
        ))}
      </div>

      {/* Mouse trail */}
      {mouseTrail.map((point, i) => (
        <div
          key={point.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: point.x - 5,
            top: point.y - 5,
            width: 10,
            height: 10,
            background: `hsla(${270 + i * 5}, 80%, 60%, ${0.1 + i * 0.04})`,
            transform: `scale(${1 - i * 0.04})`
          }}
        />
      ))}

      {/* Floating elements */}
      {floatingElements.map(el => (
        <div
          key={el.id}
          className="absolute pointer-events-none text-4xl transition-transform"
          style={{
            left: el.x,
            top: el.y,
            color: el.color,
            transform: `rotate(${el.rotation}deg) scale(${el.scale})`,
            textShadow: `0 0 20px ${el.color}`,
            opacity: 0.8
          }}
        >
          {el.shape}
        </div>
      ))}

      {/* Particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: p.x - p.size / 2,
            top: p.y - p.size / 2,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: p.life,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`
          }}
        />
      ))}

      {/* Central content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Main title with glitch effect */}
        <h1
          className={`text-6xl md:text-8xl font-bold mb-8 transition-all duration-300 ${glitching ? 'skew-x-12' : ''}`}
          style={{
            color: inverted ? '#1a1a2e' : '#e0e0ff',
            textShadow: glitching
              ? '4px 0 #ff00ff, -4px 0 #00ffff'
              : '0 0 40px rgba(147, 112, 219, 0.5)',
            fontFamily: 'system-ui'
          }}
        >
          {phase === 0 && 'Click Anywhere'}
          {phase === 1 && 'Keep Going...'}
          {phase === 2 && 'Reality Bends'}
          {phase === 3 && '✦ AWAKENED ✦'}
        </h1>

        {/* Subtitle */}
        <p
          className="text-xl md:text-2xl opacity-60 mb-12"
          style={{ color: inverted ? '#1a1a2e' : '#b0b0d0' }}
        >
          {phase === 0 && 'Discover what lies beneath'}
          {phase === 1 && `${12 - clicks} clicks until the shift`}
          {phase === 2 && 'The veil grows thin'}
          {phase === 3 && 'You see beyond now'}
        </p>

        {/* Click counter */}
        <div
          className="absolute bottom-8 left-8 text-sm font-mono"
          style={{ color: inverted ? '#1a1a2e' : '#6060a0' }}
        >
          Reality distortions: {clicks}
        </div>

        {/* Phase indicator */}
        <div className="flex gap-3 mb-8">
          {[0, 1, 2, 3].map(p => (
            <div
              key={p}
              className={`w-3 h-3 rounded-full transition-all duration-500 ${phase >= p ? 'scale-125' : 'scale-100'}`}
              style={{
                background: phase >= p
                  ? `hsl(${260 + p * 20}, 70%, 60%)`
                  : 'rgba(255,255,255,0.2)',
                boxShadow: phase >= p ? `0 0 15px hsl(${260 + p * 20}, 70%, 60%)` : 'none'
              }}
            />
          ))}
        </div>

        {/* Floating message */}
        {message && (
          <div
            className="absolute top-1/4 text-2xl font-light animate-bounce"
            style={{
              color: inverted ? '#1a1a2e' : '#d0d0ff',
              textShadow: '0 0 20px rgba(147, 112, 219, 0.8)'
            }}
          >
            {message}
          </div>
        )}

        {/* Secret button - hidden in corner */}
        {phase >= 2 && !secretFound && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSecretClick();
            }}
            className="absolute bottom-4 right-4 w-4 h-4 rounded-full opacity-20 hover:opacity-100 transition-opacity cursor-pointer"
            style={{ background: '#9370db' }}
            title="?"
          />
        )}

        {/* Portal */}
        {portalOpen && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ animation: 'portalOpen 2s ease-out forwards' }}
          >
            <div
              className="w-64 h-64 rounded-full"
              style={{
                background: 'radial-gradient(circle, #9370db 0%, #4a0080 40%, transparent 70%)',
                boxShadow: '0 0 100px 50px rgba(147, 112, 219, 0.5), inset 0 0 60px rgba(0,0,0,0.8)',
                animation: 'spin 10s linear infinite, pulse 2s ease-in-out infinite'
              }}
            >
              <div className="w-full h-full rounded-full flex items-center justify-center text-4xl">
                ✧
              </div>
            </div>
          </div>
        )}

        {/* The Eye */}
        {showEye && (
          <div
            className="absolute top-8 right-8 text-6xl cursor-pointer transition-transform hover:scale-125"
            onClick={(e) => {
              e.stopPropagation();
              setInverted(!inverted);
            }}
            style={{
              animation: 'blink 3s ease-in-out infinite',
              filter: 'drop-shadow(0 0 20px rgba(147, 112, 219, 0.8))'
            }}
          >
            👁️
          </div>
        )}

        {/* Interactive cards that appear in phase 2+ */}
        {phase >= 2 && (
          <div className="flex gap-6 mt-8">
            {['PAST', 'PRESENT', 'FUTURE'].map((label, i) => (
              <div
                key={label}
                onClick={(e) => {
                  e.stopPropagation();
                  setGlitching(true);
                  setTimeout(() => setGlitching(false), 800);
                  spawnParticles(e.clientX, e.clientY, 20);
                }}
                className="w-24 h-36 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 hover:-translate-y-2"
                style={{
                  background: `linear-gradient(135deg, rgba(147, 112, 219, 0.3) 0%, rgba(74, 0, 128, 0.5) 100%)`,
                  border: '1px solid rgba(147, 112, 219, 0.5)',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.3), 0 0 20px rgba(147, 112, 219, 0.2)',
                  animation: `float ${3 + i}s ease-in-out infinite`,
                  animationDelay: `${i * 0.5}s`
                }}
              >
                <span className="text-sm font-bold" style={{ color: '#d0d0ff' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gravity indicator */}
      {gravity === 'up' && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 text-lg"
          style={{
            color: inverted ? '#1a1a2e' : '#9370db',
            transform: 'rotate(180deg) translateX(50%)'
          }}
        >
          ↑ Gravity Inverted ↑
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        @keyframes portalOpen {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default BewilderPrototype;
