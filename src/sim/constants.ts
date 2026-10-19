/** Pixels per meter for rendering. */
export const PPM = 40;
export const FIXED_DT = 1 / 60;
export const VEL_ITERS = 8;
export const POS_ITERS = 3;
export const MAX_STEPS_PER_FRAME = 5;

// Game rules (GDD §5) and event plumbing. Vehicle/cargo tunables live in src/data/.
/** Catmull-Rom samples per terrain segment (level loader). */
export const TERRAIN_SAMPLES_PER_SEGMENT = 8;
export const TERRAIN_FRICTION = 0.9;
/** Fail when the roof touches the ground continuously for longer than this. */
export const ROOF_FAIL_SEC = 0.4;
/** Fail when the chassis falls this far below the lowest terrain point. */
export const FALL_MARGIN = 10;
/** Minimum time between two `impact` events of the same body. */
export const IMPACT_COOLDOWN_SEC = 0.05;
/** After spawn the suspension sags and cargo settles: no cargo damage or land events yet. */
export const SPAWN_SETTLE_SEC = 0.5;
/** Collision categories. Wheels poke above the bed floor when the suspension compresses,
 *  so cargo never collides with wheels. */
export const CAT_WHEEL = 0x0002;
export const CAT_CARGO = 0x0004;
