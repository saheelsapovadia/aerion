import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Icosahedron } from '@react-three/drei';

interface VisualAgentProps {
  analyserInput: React.MutableRefObject<AnalyserNode | null>;
  analyserOutput: React.MutableRefObject<AnalyserNode | null>;
}

const VisualAgentLowPerf: React.FC<VisualAgentProps> = ({ analyserInput, analyserOutput }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  // Reusing the theme colors from the original component
  const colors = useMemo(() => ({
    low: new THREE.Color("#0044aa"),   // Deep Blue
    high: new THREE.Color("#aa00ff"),  // Purple
    accent: new THREE.Color("#00ffff") // Cyan
  }), []);

  const dataArray = useMemo(() => new Uint8Array(32), []);

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return;

    // Calculate Audio Level
    let avgVolume = 0;
    
    // Sample Input (User)
    if (analyserInput.current) {
      analyserInput.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < 32; i++) sum += dataArray[i]; 
      avgVolume += sum / 32;
    }

    // Sample Output (AI)
    if (analyserOutput.current) {
      analyserOutput.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < 32; i++) sum += dataArray[i];
      // Boost AI visualization
      avgVolume = Math.max(avgVolume, (sum / 32) * 1.2); 
    }

    // Normalize volume (0 to 1)
    const normalizedVolume = Math.min(avgVolume / 255.0, 1.0);
    
    // Smooth interpolation for scale and color
    const targetScale = 1.0 + normalizedVolume * 0.4;
    
    // Apply scale with lerp for "flowness"
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    glowRef.current.scale.lerp(new THREE.Vector3(targetScale * 1.2, targetScale * 1.2, targetScale * 1.2), 0.1);

    // Color interpolation
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    const targetColor = new THREE.Color().copy(colors.low).lerp(colors.high, normalizedVolume);
    
    if (normalizedVolume > 0.6) {
        targetColor.lerp(colors.accent, (normalizedVolume - 0.6) * 2);
    }

    material.color.lerp(targetColor, 0.1);
    material.emissive.lerp(targetColor, 0.1);
    material.emissiveIntensity = 0.5 + normalizedVolume * 2.0;

    // Rotation for "sentinal" idle movement
    meshRef.current.rotation.y += 0.005;
    meshRef.current.rotation.z += 0.002;
    
    glowRef.current.rotation.y -= 0.005;
    glowRef.current.rotation.z -= 0.002;
  });

  return (
    <group>
      {/* Core Shape - Geometric/Tech feel for "Mission/Sentinal" */}
      <Icosahedron ref={meshRef} args={[1.5, 1]}>
        <meshStandardMaterial 
            flatShading 
            roughness={0.2}
            metalness={0.8}
            color={colors.low}
            emissive={colors.low}
            emissiveIntensity={0.5}
        />
      </Icosahedron>

      {/* Outer Wireframe Glow - "Sentinal" scanning effect */}
      <Icosahedron ref={glowRef} args={[1.8, 0]}>
         <meshBasicMaterial 
            color={colors.accent}
            wireframe
            transparent
            opacity={0.15}
         />
      </Icosahedron>
    </group>
  );
};

export default VisualAgentLowPerf;

