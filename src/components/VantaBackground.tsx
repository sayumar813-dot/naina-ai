import { useEffect, useRef } from "react";
import * as THREE from "three";

// Declare vanta on window to avoid TypeScript errors
declare global {
  interface Window {
    VANTA: any;
  }
}

type VantaEffect = "NET" | "WAVES" | "FOG" | "RINGS";

interface VantaBackgroundProps {
  effect?: VantaEffect;
}

export default function VantaBackground({ effect = "NET" }: VantaBackgroundProps) {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);

  useEffect(() => {
    // Dynamically load the chosen Vanta effect script
    const scriptId = "vanta-effect-script";
    const existingScript = document.getElementById(scriptId);

    const initVanta = () => {
      if (!vantaRef.current || vantaEffect.current) return;

      const isMobile = window.innerWidth < 768;

      if (effect === "NET" && window.VANTA?.NET) {
        vantaEffect.current = window.VANTA.NET({
          el: vantaRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          color: 0x6366f1,           // indigo-500
          backgroundColor: 0x050508,
          points: isMobile ? 8 : 14,
          maxDistance: isMobile ? 18 : 24,
          spacing: isMobile ? 18 : 14,
          showDots: true,
        });
      } else if (effect === "WAVES" && window.VANTA?.WAVES) {
        vantaEffect.current = window.VANTA.WAVES({
          el: vantaRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          color: 0x080818,          // near-black deep navy
          shininess: isMobile ? 20 : 35,
          waveHeight: isMobile ? 12 : 18,
          waveSpeed: 0.5,
          zoom: isMobile ? 0.65 : 0.85,
        });
      } else if (effect === "FOG" && window.VANTA?.FOG) {
        vantaEffect.current = window.VANTA.FOG({
          el: vantaRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          highlightColor: 0x3b0a8f,
          midtoneColor: 0x0b0b1f,
          lowlightColor: 0x1a0535,
          baseColor: 0x050508,
          blurFactor: 0.65,
          speed: 1.2,
          zoom: 0.9,
        });
      } else if (effect === "RINGS" && window.VANTA?.RINGS) {
        vantaEffect.current = window.VANTA.RINGS({
          el: vantaRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          backgroundColor: 0x050508,
          color: 0x6366f1,
        });
      }
    };

    if (!existingScript) {
      const effectSrc: Record<VantaEffect, string> = {
        NET: "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js",
        WAVES: "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.waves.min.js",
        FOG: "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.fog.min.js",
        RINGS: "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.rings.min.js",
      };

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = effectSrc[effect];
      script.async = true;
      script.onload = initVanta;
      document.head.appendChild(script);
    } else {
      // Script already exists, just init
      initVanta();
    }

    // Handle window resize — destroy and re-init for responsive sizing
    const handleResize = () => {
      if (vantaEffect.current) {
        vantaEffect.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
        vantaEffect.current = null;
      }
      // Remove the script tag so switching effects re-loads correctly
      const s = document.getElementById(scriptId);
      if (s) s.remove();
    };
  }, [effect]);

  return (
    <div
      ref={vantaRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
