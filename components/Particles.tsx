import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const Particles: React.FC<{ audioLevel: React.MutableRefObject<number> }> = ({ audioLevel }) => {
  const count = 1000;
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
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02
        ),
        baseR: r
      });
    }
    return temp;
  }, []);

  useFrame((state) => {
    if (!mesh.current) return;
    
    const level = audioLevel.current; // 0 to 1
    const explodeFactor = 1.0 + level * 0.5; // Particles expand when loud

    particles.forEach((particle, i) => {
      // Orbit logic
      particle.pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.001 * (1 + level * 5));
      
      // Pulse out logic
      const targetPos = particle.pos.clone().normalize().multiplyScalar(particle.baseR * explodeFactor);
      
      // Lerp current visual position
      const x = THREE.MathUtils.lerp(particle.pos.x, targetPos.x, 0.1);
      const y = THREE.MathUtils.lerp(particle.pos.y, targetPos.y, 0.1);
      const z = THREE.MathUtils.lerp(particle.pos.z, targetPos.z, 0.1);

      dummy.position.set(x, y, z);
      
      // Scale based on distance/audio
      const s = (Math.sin(state.clock.elapsedTime + i) * 0.5 + 0.5) * 0.05 * (1 + level * 3);
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

export default Particles;