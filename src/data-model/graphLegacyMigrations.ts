/**
 * Ordered app-level graph migrations applied before validating graphs against current node specs.
 * Used by preset load, project JSON import, and default-state restore so legacy node types remain loadable.
 */

import type { NodeGraph } from './types';
import { migrateNoiseNodes } from './noiseNodesMigration';
import { migrateBloomSphereColors } from './bloomSphereColorsMigration';
import { migrateSkyDomeColors } from './skyDomeColorsMigration';
import { migrateIridescentTunnelColors } from './iridescentTunnelColorsMigration';
import { migrateIridescentTunnelCenter } from './iridescentTunnelCenterMigration';
import { migrateDriveHomeLightsSkyGradient } from './driveHomeLightsSkyGradientMigration';
import { migrateKaleidoscopeSmooth } from './kaleidoscopeMergeMigration';
import { migrateDisplace2dUnify } from './displace2dUnifyMigration';
import { migrateDisplaceRemoveLegacyInputPorts } from './displaceRemoveLegacyInputPortsMigration';
import { migrateTransform2dUnify } from './transform2dUnifyMigration';
import { migrateTransformAngleToDegrees } from './transformAngleToDegreesMigration';
import { migrateRingsNode } from './ringsNodeMigration';
import { migrateDotsNodeParameterNames } from './dotsNodeMigration';
import { migrateParticleSystemFoldScale } from './particleSystemGrainMigration';
import { migrateStreakNodeAngleToDegrees } from './streakNodeMigration';
import { migrateWarpTerrain } from './warpTerrainMigration';
import { migrateWorleyNoiseToVoronoi } from './worleyNoiseMigration';
import { migrateRemoveSpiralNodes } from './spiralNodeRemovalMigration';
import { migrateUnifiedStripesPattern } from './stripesPatternUnificationMigration';
import { migrateInfiniteZoom } from './infiniteZoomMigration';
import { migrateBoxTorusSdfLightMode } from './boxTorusSdfLightModeMigration';
import { migrateInflatedIcosahedronColors } from './inflatedIcosahedronColorsMigration';
import { migrateGlassShellColors } from './glassShellColorsMigration';
import { migrateRadialRepeatSdfParameters } from './radialRepeatSdfMigration';
import { migratePolarCoordinatesRemoveEnabled } from './polarCoordinatesRemoveEnabledMigration';
import { migrateArrangementLanesParameters } from './arrangementLanesParametersMigration';
import { migrateArrangementNotesParameters } from './arrangementNotesParametersMigration';

export function migrateLegacyNodeGraph(graph: NodeGraph): NodeGraph {
  let g = migrateNoiseNodes(graph);
  g = migrateWorleyNoiseToVoronoi(g);
  g = migrateKaleidoscopeSmooth(g);
  g = migrateDisplace2dUnify(g);
  g = migrateDisplaceRemoveLegacyInputPorts(g);
  g = migrateTransform2dUnify(g);
  g = migrateTransformAngleToDegrees(g);
  g = migrateBloomSphereColors(g);
  g = migrateSkyDomeColors(g);
  g = migrateIridescentTunnelColors(g);
  g = migrateIridescentTunnelCenter(g);
  g = migrateRingsNode(g);
  g = migrateDotsNodeParameterNames(g);
  g = migrateParticleSystemFoldScale(g);
  g = migrateStreakNodeAngleToDegrees(g);
  g = migrateWarpTerrain(g);
  g = migrateDriveHomeLightsSkyGradient(g);
  g = migrateRemoveSpiralNodes(g);
  g = migrateInfiniteZoom(g);
  g = migrateBoxTorusSdfLightMode(g);
  g = migrateInflatedIcosahedronColors(g);
  g = migrateGlassShellColors(g);
  g = migrateRadialRepeatSdfParameters(g);
  g = migrateUnifiedStripesPattern(g);
  g = migratePolarCoordinatesRemoveEnabled(g);
  g = migrateArrangementLanesParameters(g);
  return migrateArrangementNotesParameters(g);
}
