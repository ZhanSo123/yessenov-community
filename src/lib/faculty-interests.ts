export type FacultyInterest = {
  code: string;
  label: string;
  interests: string[];
};

export const FACULTY_INTERESTS: FacultyInterest[] = [
  {
    code: "FIT",
    label: "Информационные технологии",
    interests: ["AI", "Программирование", "Стартапы"],
  },
  {
    code: "ENG",
    label: "Инженерия",
    interests: ["Инженерия", "Наука"],
  },
  {
    code: "ECO",
    label: "Экономика и финансы",
    interests: ["Финансы", "Маркетинг", "Менеджмент"],
  },
  {
    code: "BUS",
    label: "Бизнес",
    interests: ["Стартапы", "Менеджмент", "Маркетинг"],
  },
  {
    code: "MED",
    label: "Медицина и биология",
    interests: ["Наука", "Здоровье"],
  },
  {
    code: "LAW",
    label: "Право",
    interests: ["Право", "Менеджмент"],
  },
];

export const FACULTY_OPTIONS = FACULTY_INTERESTS.map((item) => ({
  value: item.code,
  label: item.label,
}));

export const suggestInterestsByFaculty = (facultyRaw: string) => {
  const faculty = facultyRaw.trim().toLowerCase();
  if (!faculty) return [];

  const exact = FACULTY_INTERESTS.find(
    (item) => item.code.toLowerCase() === faculty
  );
  if (exact) {
    return exact.interests;
  }

  const matched = FACULTY_INTERESTS.find((item) =>
    item.label.toLowerCase().includes(faculty)
  );
  if (matched) {
    return matched.interests;
  }

  return [];
};
