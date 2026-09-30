import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { NetworkEdge, NetworkGraphModel, NetworkNode, NetworkNodeType, NetworkRelationshipType } from './network-graph'

const nodeColors: Record<NetworkNodeType, string> = {
  Applicant: '#26c6e8',
  'Loan Application': '#9cafc7',
  Device: '#36d8ff',
  IP: '#668dff',
  UPI: '#48d9b5',
  'Bank Account': '#d1ddeb',
  'Default History': '#ff6575',
}

const edgeColors: Record<NetworkRelationshipType, string> = {
  APPLIED_FOR: '#586b83',
  USES_DEVICE: '#36c5ec',
  USES_IP: '#668dff',
  USES_UPI: '#48d9b5',
  USES_BANK: '#b9c9dd',
  CONNECTED_TO: '#26d7f0',
  HAS_DEFAULT_HISTORY: '#ff6575',
}

interface NetworkSceneProps {
  graph: NetworkGraphModel
  resetToken: number
  onSelectNode: (nodeId: string) => void
}

export function NetworkScene({ graph, resetToken, onSelectNode }: NetworkSceneProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(
    graph.nodes.find((node) => node.isSelectedApplication)?.id ?? graph.nodes[0]?.id ?? '',
  )
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const connectedNodeIds = new Set<string>([selectedNodeId])
  for (const edge of graph.edges) {
    if (edge.source === selectedNodeId) connectedNodeIds.add(edge.target)
    if (edge.target === selectedNodeId) connectedNodeIds.add(edge.source)
  }
  for (const edge of graph.edges) {
    if (connectedNodeIds.has(edge.source)) connectedNodeIds.add(edge.target)
    if (connectedNodeIds.has(edge.target)) connectedNodeIds.add(edge.source)
  }

  return (
    <Canvas key={resetToken} camera={{ position: [0, 0.1, 8.8], fov: 42 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#070c15']} />
      <ambientLight intensity={0.8} />
      <pointLight position={[4, 5, 6]} intensity={1.1} color="#b7eaff" />
      <pointLight position={[-4, -3, -2]} intensity={0.55} color="#1e74ad" />
      <Starfield />
      <gridHelper args={[14, 28, '#183047', '#101c2a']} position={[0, -2.3, 0]} />
      {graph.edges.map((edge) => {
        const source = graph.nodes.find((node) => node.id === edge.source)
        const target = graph.nodes.find((node) => node.id === edge.target)
        if (!source || !target) return null
        const active = connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target)
        return <NetworkLink key={edge.id} edge={edge} source={source} target={target} active={active} />
      })}
      {graph.nodes.map((node) => (
        <NetworkNodeMesh
          key={node.id}
          node={node}
          active={connectedNodeIds.has(node.id)}
          selected={node.id === selectedNodeId}
          hovered={node.id === hoveredNodeId}
          onHover={setHoveredNodeId}
          onSelect={(id) => {
            setSelectedNodeId(id)
            onSelectNode(id)
          }}
        />
      ))}
      <SceneCameraControls />
    </Canvas>
  )
}

function SceneCameraControls() {
  const { camera, gl } = useThree()
  const controls = useRef<OrbitControlsImpl | null>(null)

  useEffect(() => {
    controls.current = new OrbitControlsImpl(camera, gl.domElement)
    controls.current.enablePan = true
    controls.current.enableRotate = true
    controls.current.enableZoom = true
    controls.current.minDistance = 4
    controls.current.maxDistance = 17
    controls.current.enableDamping = true
    controls.current.dampingFactor = 0.08
    return () => controls.current?.dispose()
  }, [camera, gl])

  useFrame(() => {
    controls.current?.update()
  })

  return null
}

function Starfield() {
  const stars = useMemo(() => {
    const points = new Float32Array(300 * 3)
    for (let index = 0; index < points.length; index += 3) {
      points[index] = (Math.random() - 0.5) * 18
      points[index + 1] = (Math.random() - 0.5) * 10
      points[index + 2] = (Math.random() - 0.5) * 18
    }
    return points
  }, [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[stars, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#dbeaff" size={0.04} transparent opacity={0.7} />
    </points>
  )
}

function NetworkLink({ edge, source, target, active }: {
  edge: NetworkEdge
  source: NetworkNode
  target: NetworkNode
  active: boolean
}) {
  const positions = new Float32Array([
    source.position[0], source.position[1], source.position[2],
    target.position[0], target.position[1], target.position[2],
  ])

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={edgeColors[edge.type]} transparent opacity={active ? 0.82 : 0.12} />
    </line>
  )
}

function NetworkNodeMesh({
  node,
  active,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  node: NetworkNode
  active: boolean
  selected: boolean
  hovered: boolean
  onHover: (nodeId: string | null) => void
  onSelect: (nodeId: string) => void
}) {
  const color = node.riskLevel === 'HIGH'
    ? '#ff6575'
    : node.riskLevel === 'MEDIUM'
      ? '#ffc45b'
      : nodeColors[node.type]
  const size = node.isMain ? 0.28 : node.type === 'Applicant' ? 0.2 : node.type === 'Loan Application' ? 0.14 : 0.17
  const opacity = active ? 1 : 0.19

  return (
    <group position={node.position}>
      {selected && <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[size * 1.8, 0.014, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>}
      <mesh
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(node.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          onHover(null)
          document.body.style.cursor = ''
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(node.id)
        }}
      >
        {node.type === 'Applicant' && <sphereGeometry args={[size, 24, 24]} />}
        {node.type === 'Loan Application' && <boxGeometry args={[size * 1.5, size * 1.5, size * 1.5]} />}
        {node.type === 'Device' && <boxGeometry args={[size * 1.65, size * 1.65, size * 1.65]} />}
        {node.type === 'IP' && <octahedronGeometry args={[size * 1.18]} />}
        {node.type === 'UPI' && <torusGeometry args={[size * 0.73, size * 0.32, 10, 24]} />}
        {node.type === 'Bank Account' && <cylinderGeometry args={[size * 0.82, size * 0.82, size * 1.4, 16]} />}
        {node.type === 'Default History' && <dodecahedronGeometry args={[size * 1.12]} />}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.85 : hovered ? 0.68 : 0.35}
          metalness={0.25}
          roughness={0.32}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  )
}