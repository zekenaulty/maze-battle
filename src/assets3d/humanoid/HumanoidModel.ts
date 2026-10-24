// Body dimensions, UV origins, outer-layer expansion and shoulder pivots follow skinview3d (MIT).
// Adapted for a feet-origin, shared scene/resources, minimal appearance contract and elapsed-time transitions.
import * as THREE from 'three';
import { HUMANOID_HEIGHT, validateAppearance } from './contract';
import type { HumanoidAppearance } from './contract';
import { PARTS } from './uv';
import type { HumanoidPart } from './uv';
import { blendPose, humanoidPose, neutralPose } from './animation';
import type { HumanoidAnimation } from './animation';
import { HumanoidResources } from './HumanoidResources';

export class HumanoidModel extends THREE.Group {
  readonly joints = {} as Record<HumanoidPart, THREE.Group>;
  readonly layerMeshes = {} as Record<HumanoidPart, { base: THREE.Mesh; outer: THREE.Mesh }>;
  readonly attachmentPoints: Record<'head' | 'back' | 'leftHand' | 'rightHand', THREE.Object3D>;
  private materials: THREE.MeshStandardMaterial[];
  private pose = neutralPose(); private fromPose = neutralPose();
  private mode: HumanoidAnimation = 'neutral'; private started = 0; private elapsed = 0;
  private request = 0; private disposed = false; private pending = Promise.resolve();
  private requestedSkin = ''; loadedSkinId = ''; skinError = '';
  private look = { yaw: 0, pitch: 0 };
  appearance?: HumanoidAppearance;
  readonly resources: HumanoidResources;
  constructor(resources: HumanoidResources) {
    super(); this.resources = resources; this.name = 'humanoid';
    const base = new THREE.MeshStandardMaterial({ color: '#c2b8a8', roughness: 0.9 });
    const outer = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 1e-5, side: THREE.DoubleSide, roughness: 0.9 });
    const biasedBase = base.clone(), biasedOuter = outer.clone();
    for (const m of [biasedBase, biasedOuter]) { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; }
    // Expanded clothing meets at neutral limb seams. Give opposing limb shells distinct depth ownership.
    const rightOuter = biasedOuter.clone(); rightOuter.polygonOffsetUnits = 2;
    this.materials = [base, outer, biasedBase, biasedOuter, rightOuter];
    for (const part of PARTS) {
      const joint = new THREE.Group(); joint.name = part;
      const limb = part.endsWith('Arm') || part.endsWith('Leg');
      const inner = new THREE.Mesh(resources.geometry(part, false, false), limb ? biasedBase : base);
      const clothing = new THREE.Mesh(resources.geometry(part, true, false), limb ? part.startsWith('right') ? rightOuter : biasedOuter : outer);
      inner.name = `${part}:base`; clothing.name = `${part}:outer`;
      joint.add(inner, clothing); this.add(joint); this.joints[part] = joint; this.layerMeshes[part] = { base: inner, outer: clothing };
    }
    this.joints.head.position.set(0, 24, 0); this.joints.torso.position.set(0, 18, 0);
    this.joints.rightArm.position.set(-5, 22, 0); this.joints.leftArm.position.set(5, 22, 0);
    // Adjacent legs meet at x=0; no overlapping coplanar thigh faces.
    this.joints.rightLeg.position.set(-2, 12, 0); this.joints.leftLeg.position.set(2, 12, 0);
    this.attachmentPoints = Object.fromEntries(['head', 'back', 'leftHand', 'rightHand'].map(name => [name, new THREE.Object3D()])) as typeof this.attachmentPoints;
    this.joints.head.add(this.attachmentPoints.head); this.attachmentPoints.head.position.y = 8;
    this.joints.torso.add(this.attachmentPoints.back); this.attachmentPoints.back.position.z = -2.5;
    this.joints.leftArm.add(this.attachmentPoints.leftHand); this.joints.rightArm.add(this.attachmentPoints.rightHand);
  }
  applyAppearance(appearance: HumanoidAppearance) {
    if (this.disposed) return Promise.reject(new Error('Humanoid model disposed'));
    validateAppearance(appearance); this.appearance = { ...appearance, attachments: appearance.attachments?.slice() };
    this.scale.setScalar(HUMANOID_HEIGHT / 32 * appearance.scale);
    const slim = appearance.model === 'slim';
    for (const part of PARTS) {
      const { base, outer } = this.layerMeshes[part];
      base.geometry = this.resources.geometry(part, false, slim); outer.geometry = this.resources.geometry(part, true, slim);
      const center = part === 'head' ? [0, 4, 0] : part.endsWith('Arm') ? [part === 'leftArm' ? slim ? 0.5 : 1 : slim ? -0.5 : -1, -4, 0]
        : part.endsWith('Leg') ? [0, -6, 0] : [0, 0, 0];
      base.position.set(center[0], center[1], center[2]); outer.position.copy(base.position); outer.visible = appearance.outerLayerVisible;
    }
    this.attachmentPoints.leftHand.position.set(slim ? 0.5 : 1, -10, 0);
    this.attachmentPoints.rightHand.position.set(slim ? -0.5 : -1, -10, 0);
    if (this.requestedSkin !== appearance.skinAssetId) {
      this.requestedSkin = appearance.skinAssetId; const request = ++this.request; this.skinError = '';
      this.loadedSkinId = ''; for (const m of this.materials) { m.map = null; m.color.set('#c2b8a8'); m.needsUpdate = true; }
      this.pending = this.resources.texture(appearance.skinAssetId).then(texture => {
        if (this.disposed || request !== this.request) return;
        for (const m of this.materials) { m.map = texture; m.color.set('#ffffff'); m.needsUpdate = true; }
        this.loadedSkinId = appearance.skinAssetId;
      }).catch(error => { if (!this.disposed && request === this.request) this.skinError = String(error.message ?? error); });
    }
    return this.pending;
  }
  setAnimation(mode: HumanoidAnimation) {
    if (mode === this.mode) return;
    if (mode === 'neutral') { this.resetPose(); return; }
    this.mode = mode; this.started = this.elapsed; this.fromPose = structuredClone(this.pose);
  }
  setHeadOrientation(yaw: number, pitch: number) {
    this.look = { yaw: THREE.MathUtils.clamp(yaw, -Math.PI / 2, Math.PI / 2), pitch: THREE.MathUtils.clamp(pitch, -Math.PI / 3, Math.PI / 3) };
  }
  setWireframe(value: boolean) { for (const m of this.materials) m.wireframe = value; }
  resetPose() { this.mode = 'neutral'; this.pose = this.fromPose = neutralPose(); this.look = { yaw: 0, pitch: 0 }; this.started = this.elapsed; this.applyPose(); }
  update(seconds: number) {
    this.elapsed = Math.max(0, seconds);
    this.pose = blendPose(this.fromPose, humanoidPose(this.mode, this.elapsed - this.started), (this.elapsed - this.started) / 0.2);
    this.applyPose();
  }
  private applyPose() {
    for (const part of PARTS) this.joints[part].rotation.set(...this.pose[part]);
    this.joints.head.rotation.y += this.look.yaw; this.joints.head.rotation.x += this.look.pitch;
  }
  ready() { return this.pending; }
  dispose() { if (this.disposed) return; this.disposed = true; ++this.request; this.removeFromParent(); for (const m of this.materials) m.dispose(); }
}
