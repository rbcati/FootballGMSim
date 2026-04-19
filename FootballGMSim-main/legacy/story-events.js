window.storyEvents = [
  {
    "event_id": "successor_tension",
    "title": "The Heir Apparent",
    "conditions": { "vet_age_min": 32, "vet_ovr_min": 85, "prospect_pot_min": 90, "pos_match": true },
    "choices": [
      { "label": "Force Mentorship", "effect": { "vet_mental": -3, "prospect_xp_mult": 2.0, "chemistry": -10 } },
      { "label": "Support the Vet", "effect": { "vet_mental": +2, "prospect_pot_decay": 0.98, "chemistry": +5 } }
    ]
  },
  {
    "event_id": "late_bloomer",
    "title": "The Spotlight Adjustment",
    "conditions": { "is_bust": true, "games_started_streak": 3, "performance_above_avg": true },
    "effect": { "potential_floor_boost": +5, "consistency_stat": +10, "is_bust": false }
  },
  {
    "event_id": "hometown_hero",
    "title": "The Legacy Discount",
    "conditions": { "years_on_team_min": 5, "age_min": 30, "regression_started": true },
    "effect": { "contract_demand_mult": 0.7, "locker_room_leadership": +5 }
  },
  {
    "event_id": "contract_year_surge",
    "title": "Playing for the Bag",
    "conditions": { "contract_years_left": 1, "traits": ["Ambitious"] },
    "effect": { "physical_boost_temp": +4, "regression_risk_next_year": 1.5 }
  },
  {
    "event_id": "redshirt_development",
    "title": "The Rodgers/Brady Rule",
    "conditions": { "is_starter": false, "prospect_age_max": 24, "incumbent_mental_min": 85 },
    "effect": { "mental_growth_mult": 1.5, "physical_growth_mult": 0.5, "experience_gain": "accelerated" }
  }
];
