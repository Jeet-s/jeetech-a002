import { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import { Canvas, Circle, Group, Path, RoundedRect, Skia } from "@shopify/react-native-skia";
import { moodColor, moodFaceInk, moodSoft } from "./theme";

/**
 * MoodFace — Floria's signature mood glyph. A soft rounded-square tile in the
 * mood's colour with a hand-drawn face whose whole expression — brows, eyes,
 * mouth and a hint of cheek — is set by the 1..5 score, so every mood reads the
 * same everywhere (Home grid, calendar tiles, entry cards, charts) instead of
 * leaning on generic system emoji. This IS the brand: an ownable, consistent
 * character set no competitor shares.
 *
 * The five faces are ONE family: they share eye centres and a single mouth that
 * ramps from a deep frown to a wide grin. The personality comes from two layered
 * cues — worried brows that ease off and flip to a lift as mood climbs, and soft
 * blush cheeks that fade in on the happy end — so the set reads as drawn by one
 * hand, warm but never cartoonish. Level 5 earns the flourish: closed "happy"
 * arc eyes. `variant="solid"` is the bright filled tile for logging and headline
 * spots; `variant="soft"` is a tinted tile with a coloured face for dense lists.
 * Vectors (Skia) stay crisp from 20px calendar dots to 96px hero tiles.
 */
type FaceGeom = {
  eyes: "dots" | "happy";
  mouth: string;
  /** Worried-brow strokes (inner ends raised). Omitted once the mood is content. */
  brows?: [string, string];
  /** Blush cheeks fade in on the positive end; 0 = none. */
  cheek: number;
};

// Geometry authored in a 100×100 box, scaled to `size`. awful→great. Eyes share
// the SAME centres (35/65 at cy≈44); brows sit at cy≈30; cheeks at cy≈60.
const FACES: Record<number, FaceGeom> = {
  1: { eyes: "dots", brows: ["M26 35 Q34 29 43 31", "M57 31 Q66 29 74 35"], mouth: "M33 70 Q50 56 67 70", cheek: 0 }, // deep frown, steep worry
  2: { eyes: "dots", brows: ["M27 33 Q35 30 43 31", "M57 31 Q65 30 73 33"], mouth: "M34 66 Q50 60 66 66", cheek: 0 }, // slight frown, soft worry
  3: { eyes: "dots", mouth: "M35 64 L65 64", cheek: 0 }, // calm, flat
  4: { eyes: "dots", mouth: "M33 60 Q50 72 67 60", cheek: 0.5 }, // smile + a little blush
  5: { eyes: "happy", mouth: "M31 59 Q50 78 69 59", cheek: 1 }, // wide grin, happy eyes, bright blush
};

const level = (score: number) => Math.max(1, Math.min(5, Math.round(score)));

export function MoodFace({
  score,
  color,
  size = 56,
  variant = "solid",
  style,
}: {
  score: number;
  /** Override the tile colour (e.g. a custom mood's own colour). Defaults to the brand mood scale. */
  color?: string;
  size?: number;
  variant?: "solid" | "soft";
  style?: ViewStyle;
}) {
  const lv = level(score);
  const geom = FACES[lv];
  const tile = color ?? moodColor(lv);
  const bg = variant === "solid" ? tile : moodSoft(lv);
  const ink = variant === "solid" ? moodFaceInk : tile;
  // Blush reads as a soft warm shade of the ink — subtle, so it warms the face
  // without turning it into a sticker. Brighter on solid tiles, gentle on soft.
  const cheekColor = variant === "solid" ? "rgba(255,255,255,0.22)" : `${tile}22`;
  const r = size * 0.3;
  const k = size / 100;

  const mouth = useMemo(() => Skia.Path.MakeFromSVGString(geom.mouth), [geom.mouth]);
  const browL = useMemo(() => (geom.brows ? Skia.Path.MakeFromSVGString(geom.brows[0]) : null), [geom.brows]);
  const browR = useMemo(() => (geom.brows ? Skia.Path.MakeFromSVGString(geom.brows[1]) : null), [geom.brows]);
  // Happy eyes centred on the SAME 35/65 x as the dot eyes, so level 5 feels like a smile, not a redraw.
  const happyL = useMemo(() => Skia.Path.MakeFromSVGString("M27 47 Q35 39 43 47"), []);
  const happyR = useMemo(() => Skia.Path.MakeFromSVGString("M57 47 Q65 39 73 47"), []);

  // Refined, even line weight (~2dp visual) across every feature.
  const stroke = Math.max(2, size * 0.055);
  const eyeR = size * 0.064;

  return (
    <View style={[{ width: size, height: size }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Canvas style={{ width: size, height: size }}>
        <RoundedRect x={0} y={0} width={size} height={size} r={r} color={bg} />
        <Group transform={[{ scale: k }]}>
          {/* Cheeks sit behind the features so a rounded tile still feels soft. */}
          {geom.cheek > 0 ? (
            <Group opacity={geom.cheek}>
              <Circle cx={25} cy={60} r={8} color={cheekColor} />
              <Circle cx={75} cy={60} r={8} color={cheekColor} />
            </Group>
          ) : null}
          {browL && browR ? (
            <>
              <Path path={browL} color={ink} style="stroke" strokeWidth={(stroke * 0.9) / k} strokeCap="round" />
              <Path path={browR} color={ink} style="stroke" strokeWidth={(stroke * 0.9) / k} strokeCap="round" />
            </>
          ) : null}
          {geom.eyes === "happy" && happyL && happyR ? (
            <>
              <Path path={happyL} color={ink} style="stroke" strokeWidth={stroke / k} strokeCap="round" />
              <Path path={happyR} color={ink} style="stroke" strokeWidth={stroke / k} strokeCap="round" />
            </>
          ) : (
            <>
              <Circle cx={35} cy={44} r={eyeR / k} color={ink} />
              <Circle cx={65} cy={44} r={eyeR / k} color={ink} />
            </>
          )}
          {mouth ? <Path path={mouth} color={ink} style="stroke" strokeWidth={stroke / k} strokeCap="round" strokeJoin="round" /> : null}
        </Group>
      </Canvas>
    </View>
  );
}
