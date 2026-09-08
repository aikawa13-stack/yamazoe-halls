export const facilities = {
  higashiyama: {
    label: "東山",
    rooms: [
      { id: "higashiyama_1f_large_meeting_room", label: "１階 大会議室" },
      { id: "higashiyama_1f_cooking_practice_room", label: "１階 料理実習室" },
      { id: "higashiyama_2f_large_japanese_room", label: "２階 和室（大）" },
      { id: "higashiyama_2f_small_japanese_room", label: "２階 和室（小）" },
      { id: "higashiyama_2f_training_room", label: "２階 研修室" },
    ],
  },
  hatano: {
    label: "波多野（文化伝習館）",
    rooms: [
      { id: "hatano_training_room", label: "研修室" },
    ],
  },
  toyohara: {
    label: "豊原",
    rooms: [
      { id: "toyohara_large_training_room", label: "大研修室" },
      { id: "toyohara_training_room", label: "研修室" },
      { id: "toyohara_cooking_practice_room", label: "料理実習室" },
    ],
  },
};

export const slots = [
  { id: "morning", label: "午前", hours: "9:00–12:00" },
  { id: "afternoon", label: "午後", hours: "13:00–17:00" },
  { id: "night", label: "夜間", hours: "18:00–21:00" },
  { id: "all_day", label: "全日", hours: "9:00–21:00" },
];

export function roomsFor(facility) { return facilities[facility]?.rooms || []; }
export function facilityLabel(facility) { return facilities[facility]?.label || facility; }
export function roomLabel(facility, room) { return roomsFor(facility).find((item) => item.id === room)?.label || room; }
export function slotLabel(slot) { return slots.find((item) => item.id === slot)?.label || slot; }
