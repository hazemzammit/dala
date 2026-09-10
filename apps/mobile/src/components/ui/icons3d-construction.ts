/**
 * apps/mobile/src/components/ui/icons3d-construction.ts
 *
 * IMPROVEMENT-PLAN Part B foundation. Second registry, per the guide's own
 * "same pattern as icons3d.ts, or fold both into one file" choice — kept
 * separate: the two sets serve different concerns (generic UI/status vs.
 * construction-domain), and a flat 114-entry single file would be harder
 * to scan than two ~55-entry ones.
 *
 * Unlike Part A, dala-construction-icons.zip's own filenames rarely
 * matched their guide-table slugs — every one of the 60 kept files below
 * was renamed. Judgment calls made along the way (opened the actual PNGs
 * rather than guessing from names):
 * - `Buldozer.png` → `bulldozer` (typo fix)
 * - `CivilStructural-Engineer.png` → `structural-engineer`
 * - `High-Vis-Vest.png` → `safety-vest`
 * - `Overhead-Crane-Hook.png` → `crane-hook`
 * - `Overtime.png` → `overtime-clock`
 * - `truck.png` → `cargo-truck` (opened it — an enclosed box truck, matches
 *   the guide's own "Box truck" description for this slug exactly)
 * - `van.png` → `cargo-van` (opened it — an enclosed panel van)
 * - `Box.png` → `supply-box` (opened it — a wooden crate marked fragile/
 *   this-way-up, matches "supplies/delivery" category)
 * - `Carpenter.png` → `carpenter-tools` (opened it — a toolbox with a
 *   hammer/saw/hard hat, not a person) vs. `Carpenter-person.png` →
 *   `carpenter-person` (opened it — an actual worker figure); the guide's
 *   own table already names both slugs and calls them alternates, this
 *   just resolves which delivered file is which
 *
 * `Clipboard.png` was excluded — not a leftover-duplicate the way Part
 * A's stragglers were (nothing in the guide's own dedup notes mentions
 * it), but also not named anywhere in the B2 table. The guide's own "B2.
 * Full mapping (61 icons)" header doesn't match its own table, which only
 * actually enumerates 60 unique slugs — 61 delivered PNGs minus this one
 * orphan lines up exactly, suggesting Clipboard.png was meant to be
 * dropped from the package before it shipped, not that the table is
 * missing a row. It's a checklist glyph — plausibly useful for a future
 * PPE/inspection-checklist feature, but nothing today names or needs it.
 */
import apartmentBuilding from '@/assets/icons-3d/construction/apartment-building.png';
import architect from '@/assets/icons-3d/construction/architect.png';
import blueprintTube from '@/assets/icons-3d/construction/blueprint-tube.png';
import blueprint from '@/assets/icons-3d/construction/blueprint.png';
import bricks from '@/assets/icons-3d/construction/bricks.png';
import bubbleLevel from '@/assets/icons-3d/construction/bubble-level.png';
import building from '@/assets/icons-3d/construction/building.png';
import bulldozer from '@/assets/icons-3d/construction/bulldozer.png';
import cargoTruck from '@/assets/icons-3d/construction/cargo-truck.png';
import cargoVan from '@/assets/icons-3d/construction/cargo-van.png';
import carpenterPerson from '@/assets/icons-3d/construction/carpenter-person.png';
import carpenterTools from '@/assets/icons-3d/construction/carpenter-tools.png';
import cementMixer from '@/assets/icons-3d/construction/cement-mixer.png';
import cementPumpTruck from '@/assets/icons-3d/construction/cement-pump-truck.png';
import cementTrowel from '@/assets/icons-3d/construction/cement-trowel.png';
import city from '@/assets/icons-3d/construction/city.png';
import constructionSite from '@/assets/icons-3d/construction/construction-site.png';
import constructionWorker from '@/assets/icons-3d/construction/construction-worker.png';
import contract from '@/assets/icons-3d/construction/contract.png';
import craneHook from '@/assets/icons-3d/construction/crane-hook.png';
import crane from '@/assets/icons-3d/construction/crane.png';
import draftsmanDesk from '@/assets/icons-3d/construction/draftsman-desk.png';
import drawingDividers from '@/assets/icons-3d/construction/drawing-dividers.png';
import dumpTruck from '@/assets/icons-3d/construction/dump-truck.png';
import electricDrill from '@/assets/icons-3d/construction/electric-drill.png';
import electricalNetwork from '@/assets/icons-3d/construction/electrical-network.png';
import electrician from '@/assets/icons-3d/construction/electrician.png';
import engineer from '@/assets/icons-3d/construction/engineer.png';
import gasInstaller from '@/assets/icons-3d/construction/gas-installer.png';
import groupOfWorkers from '@/assets/icons-3d/construction/group-of-workers.png';
import hammer from '@/assets/icons-3d/construction/hammer.png';
import handToolSet from '@/assets/icons-3d/construction/hand-tool-set.png';
import home from '@/assets/icons-3d/construction/home.png';
import humidityTreatment from '@/assets/icons-3d/construction/humidity-treatment.png';
import interOfficeEnvelope from '@/assets/icons-3d/construction/inter-office-envelope.png';
import interiorDesigner from '@/assets/icons-3d/construction/interior-designer.png';
import invoice from '@/assets/icons-3d/construction/invoice.png';
import laserMeasurer from '@/assets/icons-3d/construction/laser-measurer.png';
import loader from '@/assets/icons-3d/construction/loader.png';
import logbook from '@/assets/icons-3d/construction/logbook.png';
import measuringTape from '@/assets/icons-3d/construction/measuring-tape.png';
import overtimeClock from '@/assets/icons-3d/construction/overtime-clock.png';
import pallet from '@/assets/icons-3d/construction/pallet.png';
import payrollCheck from '@/assets/icons-3d/construction/payroll-check.png';
import pickupTruck from '@/assets/icons-3d/construction/pickup-truck.png';
import plumber from '@/assets/icons-3d/construction/plumber.png';
import plumbing from '@/assets/icons-3d/construction/plumbing.png';
import safetyCone from '@/assets/icons-3d/construction/safety-cone.png';
import safetyHelmet from '@/assets/icons-3d/construction/safety-helmet.png';
import safetyVest from '@/assets/icons-3d/construction/safety-vest.png';
import scaffolding from '@/assets/icons-3d/construction/scaffolding.png';
import structuralEngineer from '@/assets/icons-3d/construction/structural-engineer.png';
import supplyBox from '@/assets/icons-3d/construction/supply-box.png';
import toolBelt from '@/assets/icons-3d/construction/tool-belt.png';
import toolbox from '@/assets/icons-3d/construction/toolbox.png';
import urbanPlanner from '@/assets/icons-3d/construction/urban-planner.png';
import waterMeter from '@/assets/icons-3d/construction/water-meter.png';
import workOrder from '@/assets/icons-3d/construction/work-order.png';
import worksiteBarricade from '@/assets/icons-3d/construction/worksite-barricade.png';
import worksiteLadder from '@/assets/icons-3d/construction/worksite-ladder.png';

export const icons3dConstruction = {
  'safety-helmet': safetyHelmet,
  'construction-worker': constructionWorker,
  'group-of-workers': groupOfWorkers,
  electrician,
  plumber,
  'carpenter-person': carpenterPerson,
  'structural-engineer': structuralEngineer,
  architect,
  'urban-planner': urbanPlanner,
  'interior-designer': interiorDesigner,
  'gas-installer': gasInstaller,
  engineer,
  'carpenter-tools': carpenterTools,
  'pickup-truck': pickupTruck,
  'cargo-truck': cargoTruck,
  'cargo-van': cargoVan,
  'dump-truck': dumpTruck,
  'cement-mixer': cementMixer,
  'cement-pump-truck': cementPumpTruck,
  loader,
  bulldozer,
  crane,
  'crane-hook': craneHook,
  'safety-vest': safetyVest,
  'safety-cone': safetyCone,
  'worksite-barricade': worksiteBarricade,
  scaffolding,
  'worksite-ladder': worksiteLadder,
  toolbox,
  'tool-belt': toolBelt,
  'hand-tool-set': handToolSet,
  hammer,
  'electric-drill': electricDrill,
  bricks,
  'supply-box': supplyBox,
  pallet,
  'bubble-level': bubbleLevel,
  'measuring-tape': measuringTape,
  'laser-measurer': laserMeasurer,
  'cement-trowel': cementTrowel,
  'blueprint-tube': blueprintTube,
  blueprint,
  'draftsman-desk': draftsmanDesk,
  'drawing-dividers': drawingDividers,
  contract,
  invoice,
  'payroll-check': payrollCheck,
  'work-order': workOrder,
  logbook,
  'inter-office-envelope': interOfficeEnvelope,
  'construction-site': constructionSite,
  'apartment-building': apartmentBuilding,
  building,
  home,
  city,
  'electrical-network': electricalNetwork,
  'water-meter': waterMeter,
  plumbing,
  'humidity-treatment': humidityTreatment,
  'overtime-clock': overtimeClock,
} as const;

export type Icon3DConstructionName = keyof typeof icons3dConstruction;

/**
 * Scene-tier (120px default) — same visual-composition test as Part A's
 * SCENE_ICONS, decided by opening each PNG: `group-of-workers` (three
 * figures), `construction-site` (a small diorama — two cranes, a
 * foundation pit), `draftsman-desk` (desk + drafting arm + blueprint +
 * tools composed together), `city` (a full block of buildings + street +
 * trees), `crane` (a full tower crane with a suspended load — the guide's
 * own text hints at this: it offers `crane-hook` as "a simpler/smaller
 * accent if crane reads too busy", which only makes sense if `crane`
 * itself is the busier of the two). Every single-vehicle and single-tool
 * icon — including detailed ones like `cement-pump-truck` — reads as one
 * cohesive object and stays glyph-tier, same call as Part A's `to-do-list`
 * and `wallet-cash`.
 */
export const SCENE_ICONS_CONSTRUCTION = new Set<Icon3DConstructionName>([
  'group-of-workers',
  'construction-site',
  'draftsman-desk',
  'city',
  'crane',
]);
