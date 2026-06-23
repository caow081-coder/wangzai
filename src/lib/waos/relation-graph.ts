/**
 * WAOS Relationship Graph — 关系图谱引擎
 *
 * 方案文档第五层漏洞：
 *   客户关系不是线性的。CRM 的"阶段"模型是错的。
 *   真实关系：咨询→消失半年→回来→成交→退款→复购
 *   解决方案：图结构节点+边，支持动态影响力计算
 */

export interface GraphNode {
  id: string
  customerId?: string
  name: string
  type: 'customer' | 'family' | 'event' | 'product' | 'school'
  importance: number
  properties: Record<string, string>
}

export interface GraphEdge {
  id: string
  fromId: string
  toId: string
  type: 'parent_of' | 'belongs_to' | 'interested_in' | 'recommended' | 'consulted'
  weight: number
  properties: Record<string, string>
}

export interface RelationGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  // adjacency map for quick neighbor lookup; each nodeId maps to array of incident edges (both incoming and outgoing)
  adjacency: Map<string, GraphEdge[]>
}

const graphs = new Map<string, RelationGraph>()

function getOrCreateGraph(customerId: string): RelationGraph {
  if (!graphs.has(customerId)) {
    graphs.set(customerId, { nodes: new Map(), edges: [], adjacency: new Map() })
  }
  return graphs.get(customerId)!
}

export function addNode(customerId: string, node: GraphNode): void {
  const g = getOrCreateGraph(customerId)
  g.nodes.set(node.id, node)
  if (!g.adjacency.has(node.id)) {
    g.adjacency.set(node.id, [])
  }
}

export function addEdge(customerId: string, edge: GraphEdge): void {
  const g = getOrCreateGraph(customerId)
  const exists = g.edges.find(e =>
    e.fromId === edge.fromId && e.toId === edge.toId && e.type === edge.type
  )
  if (!exists) {
    g.edges.push(edge)
    // add to adjacency for both nodes
    if (!g.adjacency.has(edge.fromId)) g.adjacency.set(edge.fromId, [])
    if (!g.adjacency.has(edge.toId)) g.adjacency.set(edge.toId, [])
    g.adjacency.get(edge.fromId)!.push(edge)
    g.adjacency.get(edge.toId)!.push(edge)
  }
}

export function getNeighbors(customerId: string, nodeId: string, direction: 'out' | 'in' | 'both' = 'both'): GraphNode[] {
  const g = graphs.get(customerId)
  if (!g) return []
  const neighborIds = new Set<string>()
  const edges = g.adjacency.get(nodeId) || []
  for (const edge of edges) {
    // filter self-loop
    if (edge.fromId === edge.toId) continue
    if (direction !== 'in' && edge.fromId === nodeId) neighborIds.add(edge.toId)
    if (direction !== 'out' && edge.toId === nodeId) neighborIds.add(edge.fromId)
  }
  return Array.from(neighborIds).map(id => g.nodes.get(id)!).filter(Boolean)
}

export function getInfluence(customerId: string, nodeId: string): number {
  const g = graphs.get(customerId)
  if (!g) return 0
  let influence = 0
  const edges = g.adjacency.get(nodeId) || []
  for (const edge of edges) {
    // edge may be incident either direction
    influence += edge.weight
  }
  return influence
}

export function detectReferralChain(customerId: string): { referrerId: string; referredId: string; score: number }[] {
  const g = graphs.get(customerId)
  if (!g) return []
  const chains: { referrerId: string; referredId: string; score: number }[] = []
  const visited = new Set<string>() // edge IDs visited
  for (const edge of g.edges) {
    if (edge.type === 'recommended' && !visited.has(edge.id)) {
+      // simple cycle prevention: if a node refers to itself indirectly, skip
+      if (edge.fromId === edge.toId) continue
+      visited.add(edge.id)
      const referred = g.nodes.get(edge.toId)
      if (referred) {
        chains.push({
          referrerId: edge.fromId,
          referredId: edge.toId,
          score: edge.weight + (referred.importance / 10),
        })
      }
    }
  }
  return chains.sort((a, b) => b.score - a.score)
}

export function getGraphStats(customerId: string): { nodeCount: number; edgeCount: number; density: number } {
  const g = graphs.get(customerId)
  if (!g) return { nodeCount: 0, edgeCount: 0, density: 0 }
  const nodeCount = g.nodes.size
  const edgeCount = g.edges.length
  const maxEdges = nodeCount * (nodeCount - 1)
  return { nodeCount, edgeCount, density: maxEdges > 0 ? edgeCount / maxEdges : 0 }
}

export function buildRelationContext(customerId: string): string {
  const g = graphs.get(customerId)
  if (!g || g.nodes.size === 0) return ''
  const lines: string[] = ['【客户关系图谱】']
  const familyNodes = Array.from(g.nodes.values()).filter(n => n.type === 'family')
  const eventNodes = Array.from(g.nodes.values()).filter(n => n.type === 'event')
  if (familyNodes.length > 0) lines.push('家庭成员: ' + familyNodes.map(n => n.name).join('、'))
  if (eventNodes.length > 0) lines.push('关键事件: ' + eventNodes.map(n => n.name).join('、'))
  for (const edge of g.edges) {
    if (edge.type === 'recommended') {
      const from = g.nodes.get(edge.fromId)
      const to = g.nodes.get(edge.toId)
      if (from && to) lines.push('转介绍: ' + from.name + ' → ' + to.name + ' (强度:' + edge.weight + ')')
    }
  }
  return lines.join('\n')
}
