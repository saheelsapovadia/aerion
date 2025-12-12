import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const ParticlesLowPerf: React.FC<{ audioLevel: React.MutableRefObject<number> }> = ({ audioLevel }) => {
  const count = 200; // Reduced from 1000 for low performance
  const mesh = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Random initial positions and speeds
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const r = 5 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      temp.push({
        pos: new THREE.Vector3(x, y, z),
        baseR: r
      });
    }
    return temp;
  }, []);

  useFrame((state) => {
    if (!mesh.current) return;
    
    const level = audioLevel.current; // 0 to 1
    const time = state.clock.elapsedTime;
    
    // Simplified update loop
    particles.forEach((particle, i) => {
      // Simple rotation around Y axis instead of complex orbit
      const angle = time * 0.1;
      const x = particle.pos.x * Math.cos(angle) - particle.pos.z * Math.sin(angle);
      const z = particle.pos.x * Math.sin(angle) + particle.pos.z * Math.cos(angle);
      const y = particle.pos.y;

      // Simple pulse
      const pulse = 1 + level * 0.5;
      
      dummy.position.set(x * pulse, y * pulse, z * pulse);
      
      // Simplified scale
      const s = 0.05 * (1 + level);
      dummy.scale.set(s, s, s);
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#44aaff" transparent opacity={0.4} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
};

export default ParticlesLowPerf;

