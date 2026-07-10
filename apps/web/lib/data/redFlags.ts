import type { RedFlagItem } from "@/lib/types";

// Safety screening items grouped by category.
export const redFlags: RedFlagItem[] = [
  { id: "rf_cancer", category: "Cancer", label: "History of cancer", detail: "Previous malignancy with new unexplained pain" },
  { id: "rf_weightloss", category: "Cancer", label: "Unexplained weight loss", detail: "Significant loss without dieting" },
  { id: "rf_nightpain", category: "Cancer", label: "Constant, unremitting night pain", detail: "Non-mechanical, unrelieved by position" },

  { id: "rf_fracture_trauma", category: "Fracture", label: "Significant recent trauma", detail: "Fall, road accident, direct blow" },
  { id: "rf_fracture_osteo", category: "Fracture", label: "Osteoporosis + minor trauma", detail: "Fragility fracture risk" },
  { id: "rf_steroids", category: "Fracture", label: "Prolonged corticosteroid use", detail: "Increased fracture risk" },

  { id: "rf_fever", category: "Infection", label: "Fever / chills", detail: "Systemic signs of infection" },
  { id: "rf_ivdu", category: "Infection", label: "Recent infection or IV drug use", detail: "Risk of spinal/joint infection" },
  { id: "rf_immuno", category: "Infection", label: "Immunosuppression", detail: "Higher infection susceptibility" },

  { id: "rf_ce_saddle", category: "Cauda Equina", label: "Saddle anaesthesia", detail: "Numbness around perineum/inner thighs" },
  { id: "rf_ce_bladder", category: "Cauda Equina", label: "Bladder / bowel dysfunction", detail: "Retention, incontinence, loss of control" },
  { id: "rf_ce_sexual", category: "Cauda Equina", label: "Sexual dysfunction (new)", detail: "New loss of genital sensation" },

  { id: "rf_neuro_progressive", category: "Neurological", label: "Progressive neurological deficit", detail: "Worsening weakness / numbness" },
  { id: "rf_neuro_bilateral", category: "Neurological", label: "Bilateral limb symptoms", detail: "Numbness or weakness in both limbs" },

  { id: "rf_dvt_calf", category: "DVT", label: "Unilateral calf pain / swelling", detail: "Warm, tender, swollen calf" },
  { id: "rf_dvt_risk", category: "DVT", label: "Recent immobilisation / surgery", detail: "Raised thrombosis risk" },

  { id: "rf_cardiac_chest", category: "Cardiac", label: "Chest pain / tightness", detail: "Especially with exertion" },
  { id: "rf_cardiac_breath", category: "Cardiac", label: "Shortness of breath", detail: "Unexplained dyspnoea, palpitations" },

  { id: "rf_severe_pain", category: "General", label: "Severe unexplained pain", detail: "Out of proportion to findings" },
];

export const redFlagCategories = Array.from(
  new Set(redFlags.map((r) => r.category))
);
