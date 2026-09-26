/**
 * AetherPact — 3D Hero Scene (React Three Fiber).
 * A tasteful floating abstract shape — low-poly icosahedron with a
 * wireframe overlay plus a soft point light. Not gimmicky; just adds
 * quiet depth behind the hero headline. Colors are props so the same
 * component serves both the original app theme and the Landing page
 * design brief's espresso/brass palette without duplicating the scene.
 */

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Icosahedron, MeshDistortMaterial, Float } from '@react-three/drei'
import type { Mesh } from 'three'

interface Props {
  primaryColor?: string
  wireColor?: string
  lightColor?: string
}

function FloatingShape({ primaryColor, wireColor }: Required<Pick<Props, 'primaryColor' | 'wireColor'>>) {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.15
      meshRef.current.rotation.y += delta * 0.25
    }
  })

  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.8}>
      <Icosahedron ref={meshRef} args={[1.4, 1]}>
        <MeshDistortMaterial
          color={primaryColor}
          wireframe={false}
          distort={0.25}
          speed={1.5}
          opacity={0.85}
          transparent
          roughness={0.1}
          metalness={0.6}
        />
      </Icosahedron>
      <Icosahedron args={[1.45, 1]}>
        <meshBasicMaterial color={wireColor} wireframe opacity={0.3} transparent />
      </Icosahedron>
    </Float>
  )
}

export default function HeroScene({
  primaryColor = '#C7CEEA',
  wireColor = '#3A4876',
  lightColor = '#C7CEEA',
}: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 3]} intensity={1.8} color={lightColor} />
      <pointLight position={[-3, -2, -3]} intensity={0.6} color={wireColor} />
      <FloatingShape primaryColor={primaryColor} wireColor={wireColor} />
    </Canvas>
  )
}
