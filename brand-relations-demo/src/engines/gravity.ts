import { GRAVITY_CONFIG } from '../config';
import { hash } from '../domain/hash';
import type { RelationResult, SpatialPosition } from '../domain/types';
export function fitToDistance(fit: number): number {
  const { minDistance, maxDistance, gamma } = GRAVITY_CONFIG;
  return minDistance + Math.pow(1 - Math.min(100, Math.max(0, fit)) / 100, gamma) * (maxDistance - minDistance);
}
function clearance(a: SpatialPosition, b: SpatialPosition) {
  return Math.max(Math.abs(a.x - b.x) / GRAVITY_CONFIG.nodeSpacingX, Math.abs(a.y - b.y) / GRAVITY_CONFIG.nodeSpacingY);
}

/** Continuous score-ordered radii fill the field instead of repeating score rings.
 * Rank spacing allocates area, not LOD slots. Stable tie breaks only affect layout.
 */
function distanceTargets(focusId: string, relations: readonly RelationResult[]) {
  const { minDistance, maxDistance, radialSpread } = GRAVITY_CONFIG;
  const sorted = [...relations].sort((a, b) => b.collaborationFit - a.collaborationFit
    || hash(`${focusId}:${a.targetBrandId}`) - hash(`${focusId}:${b.targetBrandId}`)
    || a.targetBrandId.localeCompare(b.targetBrandId));
  return sorted.map((relation, index) => {
    const scoreRadius = fitToDistance(relation.collaborationFit);
    // sqrt(rank) distributes a population across area rather than concentric rows.
    const areaRadius = minDistance + (maxDistance - minDistance) * Math.sqrt((index + .5) / sorted.length);
    const radius = sorted.length === 1 ? scoreRadius : scoreRadius * (1 - radialSpread) + areaRadius * radialSpread;
    return { relation, radius };
  });
}

/** Angle-only collision handling preserves the continuous radial score ordering. */
function arrange(focusId: string, targets: ReturnType<typeof distanceTargets>, attempt: number): SpatialPosition[] {
  const placed: SpatialPosition[] = [];
  for (const [index, { relation, radius }] of targets.entries()) {
    const base = hash(`${focusId}:${relation.targetBrandId}:${attempt}`) / 2 ** 32 * Math.PI * 2 + index * GRAVITY_CONFIG.goldenAngle;
    let best = { x: 0, y: 0, clearance: -Infinity };
    for (let candidate = 0; candidate < GRAVITY_CONFIG.angleCandidates; candidate++) {
      const angle = base + candidate * GRAVITY_CONFIG.goldenAngle;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      let space=Infinity;
      for(const other of placed) {
        space=Math.min(space,Math.max(Math.abs(x-other.x)/GRAVITY_CONFIG.nodeSpacingX,Math.abs(y-other.y)/GRAVITY_CONFIG.nodeSpacingY));
        if(space<=best.clearance)break;
      }
      if (space > best.clearance) best = { x, y, clearance: space };
      // Keep the seeded direction once there is comfortable room. Maximizing
      // empty space unconditionally creates artificial rows and regular arcs.
      if (space >= 1.35) break;
    }
    placed.push({ brandId: relation.targetBrandId, x: best.x, y: best.y, radius });
  }
  // Bounded angle-only cleanup. Runs once per focus, never as a frame simulation.
  for (let pass = 0; pass < GRAVITY_CONFIG.collisionPasses; pass++) {
    let changed = false;
    for (const node of placed) {
      const others = placed.filter(other => other !== node);
      const penalty = (candidate: SpatialPosition) => others.reduce((sum, other) => sum + Math.pow(Math.max(0, 1.02 - clearance(candidate, other)), 2), 0);
      let bestPenalty = penalty(node);
      if (bestPenalty === 0) continue;
      let bestX = node.x, bestY = node.y;
      const base = Math.atan2(node.y, node.x);
      for (let attempt = 1; attempt < GRAVITY_CONFIG.angleCandidates; attempt++) {
        const angle = base + attempt * GRAVITY_CONFIG.goldenAngle;
        const candidate = { ...node, x: Math.cos(angle) * node.radius, y: Math.sin(angle) * node.radius };
        const value = penalty(candidate);
        if (value < bestPenalty) { bestPenalty = value; bestX = candidate.x; bestY = candidate.y; changed = true; }
        if (value === 0) break;
      }
      node.x = bestX; node.y = bestY;
    }
    if (!changed) break;
  }
  return placed;
}

function arrangementPenalty(positions: readonly SpatialPosition[]) {
  let penalty=0;
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)penalty+=Math.max(0,.91-clearance(positions[i],positions[j]))**2;
  return penalty;
}
/** Bounded deterministic restarts escape local crowded-ring minima; scores and radii stay intact. */
export function calculateGravityPositions(focusId: string, relations: readonly RelationResult[]): SpatialPosition[] {
  const targets = distanceTargets(focusId, relations);
  let best:SpatialPosition[]=[],penalty=Infinity;
  for(let attempt=0;attempt<3;attempt++) {
    const candidate=arrange(focusId,targets,attempt),next=arrangementPenalty(candidate);
    if(next<penalty){best=candidate;penalty=next;}
    if(penalty===0)break;
  }
  // A common expansion preserves continuous radial ordering and scatter angles
  // while guaranteeing whitespace. It never snaps nodes to distance bands.
  let nearest=Infinity;
  for(let i=0;i<best.length;i++)for(let j=i+1;j<best.length;j++)nearest=Math.min(nearest,clearance(best[i],best[j]));
  const expansion=Math.max(1,1.04/Math.max(nearest,.01));
  return best.map(position=>({...position,x:position.x*expansion,y:position.y*expansion,radius:position.radius*expansion}));
}
