# R1 apparatus GLB handoff

**Status:** loading infrastructure is implemented; no authored GLB is supplied or enabled.
Blender was not found on PATH or in `C:\Program Files\Blender Foundation` on 2026-10-21.
The volumetric-flask visual acceptance gate remains open. Stop at R1; do not start R2–R8.

## First asset: volumetric-flask glass shell

- Author an original flask in Blender and export a static, self-contained glTF 2.0 binary (`.glb`).
  Supply the editable `.blend`, author/source and licence record. Do not substitute an export of
  the current procedural geometry as evidence of an authored visual upgrade.
- Proposed runtime file: `apps/web/public/models/apparatus/volumetric-flask.glb`.
  The public directory/file does not exist yet. The manifest path must stay `null` until reviewed.
- Use named `body` and `neck` meshes, or groups containing visible meshes. Both are required.
  The renderer keeps their descendants and hides other meshes. Put optional `liquid`, `stopper`,
  `calibration_mark`, `label`, `solid` and `warning` parts outside those groups; they are hidden
  even when nested under a shell part, because live state is rendered separately.
- Y is up, the resting base/pivot is the origin, the neck is on the Y axis, and +Z faces the user.
  Apply object transforms before export. Export at the existing renderer's display scale;
  `unitScale` converts model units to scene units, with the manifest pivot subtracted first.
  The outer renderer applies each flask's existing relative display scale separately.
- Match the shared silhouette in `apps/web/src/workbench/flaskProfile.ts`: base at Y=0,
  maximum outer radius 0.56, rim at Y=2.1, and calibration mark at Y=1.55 (scene units).
  These are visual coordinates, not measurements of physical capacity. Keep the neck and
  inner surface compatible with the existing liquid, meniscus and stopper overlays. A changed
  silhouette needs a separate reviewed alignment change; it cannot silently alter simulation rules.
- Use glTF PBR glass materials, with legible edges against the existing room. Check transparency,
  depth ordering, liquid visibility and reflections in the actual WebGL scene, including close-ups.
  Keep the shell open at the mouth; avoid coincident faces, z-fighting and opaque interior walls.
- Embed textures. No external URLs, HDR downloads, Draco/KTX/Meshopt dependencies, lights,
  cameras, skins or required animation clips. Static meshes only in this checkpoint.
- Suggested first-asset performance budget: at most 20,000 triangles, 2 MB GLB, and 1024px textures.
  These are proposed art budgets, not measured characteristics of a delivered asset.

## Runtime behaviour

`loadApparatusModel.ts` caches one parsed source per path, returns separate object/geometry/material
instances, applies the manifest scale/pivot, checks required parts and falls back on loading errors,
missing parts, empty scenes and unsupported skinned meshes. Failed paths are cached for the page
lifetime. An unloaded or rejected asset leaves the procedural shell visible.

`AuthoredFlaskBody.tsx` integrates only the shell inside `Flask3D`. Liquid/solid, calibration mark,
stopper, labels, cleanliness marks and warnings still use the existing public scene projection.
Picking, placement, selection ring, camera presets, bilingual DOM controls and 2D fallback stay in
the existing renderer. Other apparatus manifest entries describe future art work only.

Instance geometry/materials are disposed on unmount, including late loads after unmount. Textures
remain owned by the cached source. The test cache-reset helper must only run after all instances
are unmounted; it releases cached geometry, materials and textures. Animation clips are metadata
only and are not played in R1.

## R1 acceptance before enabling the manifest path

1. Review the `.blend`, source/licence, file size and topology; verify the required named parts.
2. Put the reviewed GLB at the proposed runtime path and set only the flask manifest `model`.
   Update its provenance and measured scale/pivot. Do not enable the other apparatus paths.
3. Inspect multiple flask sizes simultaneously: independent selection/placement, no disappearing
   copies, complete overview framing, and readable balance/mark close-ups.
4. Verify empty/below/at/above-mark liquid, dissolution residue, stopper, label and dirty states
   against the existing projection. Reject duplicate baked marks, liquid, labels or stopper.
5. Verify guided/manual/automatic modes, renderer switching, missing/invalid GLB fallback,
   repeated mounting/unmounting, keyboard DOM controls, English/Sinhala and reduced motion.
6. Capture actual authored-asset screenshots at 1920/1440/1366/834/390 widths and rerun focused
   renderer tests plus the Experiment 4 golden path. Stop for R1 review before further phases.

The GLB parser test uses a tiny synthetic triangle fixture solely to verify file parsing. It is not
an authored apparatus asset or evidence that the visual gate is complete.
