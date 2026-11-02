// Real-world architectural photographs of SRM University Delhi-NCR (Sonepat Campus, Rajiv Gandhi Education City, Haryana)
import srmSonepatMainBuilding from './images/srm_sonepat_main_building_1793628706048.jpg';
import srmSonepatEngineering from './images/srm_sonepat_engineering_block_1793628721580.jpg';
import srmSonepatLibrary from './images/srm_sonepat_library_1793628735984.jpg';
import srmSonepatCafeteria from './images/srm_sonepat_cafeteria_1793628752517.jpg';
import srmSonepatMainGate from './images/srm_sonepat_main_gate_1793628816149.jpg';
import srmSonepatLawMgmt from './images/srm_sonepat_law_mgmt_1793628828491.jpg';
import srmSonepatHospital from './images/srm_sonepat_hospital_1793629212422.jpg';
import srmSonepatHostel from './images/srm_sonepat_hostel_1793629224793.jpg';
import srmSonepatEnggInside from './images/srm_sonepat_engg_in_1793629238182.jpg';

export const SRM_CAMPUS_REAL_IMAGES = {
  mainBuilding: srmSonepatMainBuilding,
  engineeringBlock: srmSonepatEngineering,
  engineeringInside: srmSonepatEnggInside,
  centralLibrary: srmSonepatLibrary,
  cafeteria: srmSonepatCafeteria,
  mainGate: srmSonepatMainGate,
  lawManagement: srmSonepatLawMgmt,
  hospital: srmSonepatHospital,
  hostel: srmSonepatHostel,
} as const;

export interface CampusLandmarkPhoto {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string;
  description: string;
  accessibilityFeatures: string[];
  floor: 0 | 1;
}

export const SRM_LANDMARK_REAL_PHOTOS: Record<string, CampusLandmarkPhoto> = {
  srm_main_gate: {
    id: 'srm_main_gate',
    name: 'SRM Sonepat Ceremonial Main Gate',
    subtitle: 'Rajiv Gandhi Education City Boulevard Entry',
    imageUrl: srmSonepatMainGate,
    description: 'Monumental ceremonial sandstone entrance archway of SRM University Delhi-NCR Sonepat along the arterial Rajiv Gandhi Education City corridor, featuring palm-lined boulevards and tactile accessible sidewalks.',
    accessibilityFeatures: ['Zero-curb pedestrian crossings', 'Tactile paving along sidewalk', 'Direct accessible drop-off zone'],
    floor: 0,
  },
  srm_central_boulevard: {
    id: 'srm_central_boulevard',
    name: 'Academic Quad Concourse & Palm Boulevard',
    subtitle: 'Primary Barrier-Free Campus Concourse',
    imageUrl: srmSonepatMainGate,
    description: 'Tree-lined primary arterial concourse linking the Main Ceremonial Gate with the Administrative Block, Engineering Wings, and Central Library.',
    accessibilityFeatures: ['Smooth paving surface', 'Gradual 1.0% accessible grade', 'Continuous shade canopy'],
    floor: 0,
  },
  srm_admin_block: {
    id: 'srm_admin_block',
    name: 'Administrative & Academic Block',
    subtitle: 'SRM Sonepat Flagship Academic Headquarters',
    imageUrl: srmSonepatMainBuilding,
    description: 'The monumental neoclassical red-brick and white stone flagship building of SRM University Sonepat with grand Corinthian columns, central portico, Chancellor & Dean offices, and automated sliding doors.',
    accessibilityFeatures: ['Automated sensor sliding entrance', 'Wheelchair approach ramp with double handrails', 'Tactile lobby indicators'],
    floor: 0,
  },
  srm_engineering_block: {
    id: 'srm_engineering_block',
    name: 'Engineering & Technology Innovation Block',
    subtitle: 'B.Tech Laboratories & Robotics Center',
    imageUrl: srmSonepatEngineering,
    description: 'Modern red-brick and structural tinted glass academic facility housing computer science labs, AI research centers, mechanical workshops, and lecture amphitheaters.',
    accessibilityFeatures: ['Wide 1:12 accessible entrance ramp', 'Automated glass sliding doors', 'Step-free ground corridor'],
    floor: 0,
  },
  srm_central_library: {
    id: 'srm_central_library',
    name: 'SRM Sonepat Central University Library',
    subtitle: 'Multi-Storey Knowledge & Digital Stack Hub',
    imageUrl: srmSonepatLibrary,
    description: 'Contemporary architectural glass and terracotta building with over 100,000 volumes, digital research pods, quiet study cubicles, and a dedicated wide wheelchair ramp entrance with stainless steel railings.',
    accessibilityFeatures: ['Gradual 1:12 ramp entrance with double stainless railings', 'Low-height circulation counter', 'Spacious stack aisles (1.5m clearance)'],
    floor: 0,
  },
  srm_cafeteria: {
    id: 'srm_cafeteria',
    name: 'Campus Cafe & Student Food Court Plaza',
    subtitle: 'Central Dining Concourse & Outdoor Green Quad',
    imageUrl: srmSonepatCafeteria,
    description: 'Vibrant indoor and outdoor student dining concourse with shaded umbrella tables, multi-cuisine food kiosks, paved courtyards, and accessible seating.',
    accessibilityFeatures: ['Wheelchair-accessible dining tables', 'Flush threshold pavings', 'Low-height order counters'],
    floor: 0,
  },
  srm_law_mgmt: {
    id: 'srm_law_mgmt',
    name: 'Faculty of Law & Management Academic Block',
    subtitle: 'Moot Court Hall & Corporate Executive Classrooms',
    imageUrl: srmSonepatLawMgmt,
    description: 'Distinguished modern red-brick and glass complex hosting the Moot Court, legal aid clinic, MBA lecture halls, and executive seminar suites.',
    accessibilityFeatures: ['Wide ramp entrance with tactile warning pavers', 'Braille room signage', 'Step-free Moot Court access'],
    floor: 0,
  },
  srm_elev_ground: {
    id: 'srm_elev_ground',
    name: 'Central Academic Accessible Elevator Bank (Ground)',
    subtitle: 'Barrier-Free Vertical Transit to Level 1',
    imageUrl: srmSonepatEngineering,
    description: 'State-of-the-art glass elevator bank providing 100% step-free vertical transit between the Ground Concourse and the Level 1 Skywalk & Library.',
    accessibilityFeatures: ['Wide 1.4m elevator opening', 'Tactile and Braille buttons', 'Audio floor arrival announcements'],
    floor: 0,
  },
  srm_elev_upper: {
    id: 'srm_elev_upper',
    name: 'Academic Skywalk Elevator Landing (Level 1)',
    subtitle: 'Level 1 Skywalk Promenade Access',
    imageUrl: srmSonepatLawMgmt,
    description: 'Upper elevator landing feeding directly onto the covered Level 1 Skywalk connecting the Engineering and Law blocks.',
    accessibilityFeatures: ['Flush threshold to Skywalk', 'Emergency intercom at wheelchair height', 'Contrasting directional signage'],
    floor: 1,
  },
  srm_skywalk_l1: {
    id: 'srm_skywalk_l1',
    name: 'SRM Sonepat Inter-Block Academic Skywalk',
    subtitle: 'Elevated Level 1 Covered Promenade',
    imageUrl: srmSonepatEngineering,
    description: 'Weather-protected elevated skybridge connecting the upper lecture halls, library research mezzanine, and faculty lounges.',
    accessibilityFeatures: ['Weather-protected canopy', 'Anti-slip ceramic terrazzo', 'Continuous safety balustrade'],
    floor: 1,
  },
  srm_library_upper: {
    id: 'srm_library_upper',
    name: 'Central Library Digital Research Mezzanine',
    subtitle: 'Level 1 Quiet Study Pods & Journal Stack',
    imageUrl: srmSonepatLibrary,
    description: 'Upper research gallery housing scholarly journals, individual study carrels, and assistive technology computer terminals.',
    accessibilityFeatures: ['Screen reader assistive computer pods', 'Level elevator connection', 'Height-adjustable desks'],
    floor: 1,
  },
  srm_management_upper: {
    id: 'srm_management_upper',
    name: 'Executive MBA Seminar & Placement Suite',
    subtitle: 'Level 1 Conference Center',
    imageUrl: srmSonepatLawMgmt,
    description: 'Tiered executive conference hall and placement interview suites with wheelchair-accessible podiums and seating.',
    accessibilityFeatures: ['Accessible conference podium', 'Wide double doors', 'Hearing loop assistive system'],
    floor: 1,
  },
  srm_hospital: {
    id: 'srm_hospital',
    name: 'SRM Hospital & Health Care Center',
    subtitle: 'Multi-Specialty Medical Clinic & Emergency Care',
    imageUrl: srmSonepatHospital,
    description: 'Modern 4-storey medical facility at SRM Sonepat featuring 24/7 emergency triage, pharmacy, outpatient clinics, and a dedicated wide wheelchair ramp with stainless steel double railings.',
    accessibilityFeatures: ['Gradual 1:12 emergency ramp', 'Ambulance drop-off porch', 'Tactile paving & automatic sliding doors', 'Wheelchair bays in waiting lobby'],
    floor: 0,
  },
  srm_hostel: {
    id: 'srm_hostel',
    name: 'SRM Residential Hostel Complex',
    subtitle: 'Student Residence Halls & Living Towers',
    imageUrl: srmSonepatHostel,
    description: 'Multi-tower student residential complex at SRM University Sonepat with landscaped green quads, student study lounges, bicycle stations, and step-free paved connectivity.',
    accessibilityFeatures: ['Step-free ground floor accessible rooms', 'Wide paved pedestrian paths', 'Elevator access in residential towers'],
    floor: 0,
  },
  srm_engg_inside_lobby: {
    id: 'srm_engg_inside_lobby',
    name: 'Engineering Block - Main Ground Foyer & Atrium',
    subtitle: 'Faculty of Engineering & Technology Entry Foyer',
    imageUrl: srmSonepatEnggInside,
    description: 'Grand polished interior concourse of the Engineering Block with directory boards, security desk, and direct level pathways to research laboratories.',
    accessibilityFeatures: ['High-contrast digital directory', 'Braille floor plan indicator', 'Continuous level terrazzo floor'],
    floor: 0,
  },
  srm_engg_inside_robotics: {
    id: 'srm_engg_inside_robotics',
    name: 'Engineering Inside - Robotics Lab & AI Research Center',
    subtitle: 'Advanced Automation & Autonomous Systems Hub',
    imageUrl: srmSonepatEnggInside,
    description: 'State-of-the-art research facility with robotic arm workstations, 3D printing bay, autonomous rover test arena, and glass partition corridors.',
    accessibilityFeatures: ['Wide double door entry (1.2m)', 'Accessible low lab bench workstations', 'Anti-static slip-resistant flooring'],
    floor: 0,
  },
  srm_engg_inside_ai: {
    id: 'srm_engg_inside_ai',
    name: 'Engineering Inside - AI & High-Performance Computing Lab',
    subtitle: 'Machine Learning & Cloud Infrastructure Wing',
    imageUrl: srmSonepatEnggInside,
    description: 'High-performance computing center equipped with dual-display developer pods, server racks, and high-speed campus fiber link.',
    accessibilityFeatures: ['Ergonomic height-adjustable developer desks', 'Step-free entrance', 'Accessible server room access'],
    floor: 0,
  },
  srm_engg_inside_amphi: {
    id: 'srm_engg_inside_amphi',
    name: 'Engineering Inside - Smart Lecture Amphitheatre 101',
    subtitle: 'Interactive Audio-Visual Tiered Lecture Hall',
    imageUrl: srmSonepatEnggInside,
    description: 'Contemporary lecture hall featuring smart interactive boards, front-row designated wheelchair seating spaces, and assistive induction loop audio.',
    accessibilityFeatures: ['Designated front wheelchair berths', 'Induction audio loop for hearing aids', 'Ramped front stage access'],
    floor: 0,
  },
};

export const SRM_CAMPUS_PHOTO_LIST: CampusLandmarkPhoto[] = Object.values(SRM_LANDMARK_REAL_PHOTOS);
