// sprig's slice of the shared `spec/` ARTIFACT.
//
// The artifact's MECHANICS — the skeleton, the manifest, the version handshake,
// contract freshness, the vendored conformance vectors — used to live here,
// byte-identical to rune's copy of the same file, with the spec-root walk
// copied seven more times across the two repos. They are ONE implementation now
// (`@mrg-keystone/bedrock/artifact`, D-9), and conformance is "run the vectors
// against the imported implementation in your own CI".
//
// What stays is the only genuinely sprig-owned part: WHICH subtrees sprig
// produces, and their durability classes.

import type { ManifestEntry } from "@mrg-keystone/bedrock/artifact";

export {
  ARTIFACT_FORMAT_VERSION,
  checkArtifactVersion,
  ensureSpecSkeleton,
  readManifest,
  registerManifestEntries,
  SUPPORTED_FORMAT_MAJOR,
  verifyContractFreshness,
} from "@mrg-keystone/bedrock/artifact";
export type {
  ManifestEntry,
  SpecManifest,
} from "@mrg-keystone/bedrock/artifact";

export const SPRIG_MANIFEST_ENTRIES: Record<string, ManifestEntry> = {
  "ui/": {
    class: "durable",
    owner: "frontend",
    producer: "frontend toolchain",
  },
  "contract/binding.md": {
    class: "durable",
    owner: "frontend",
    producer: "frontend toolchain",
  },
};
