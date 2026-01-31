import { suggestInterestsByFaculty } from "@/lib/faculty-interests";

export const INTEREST_SUGGESTIONS = [
  "AI",
  "Стартапы",
  "Дизайн",
  "Маркетинг",
  "Финансы",
  "Спорт",
  "Музыка",
  "Кино",
  "Игры",
  "Наука",
  "Программирование",
  "Карьера",
  "Менеджмент",
  "Путешествия",
  "Волонтёрство",
  "Инженерия",
  "Здоровье",
  "Право",
];

type SuggestProfile = {
  faculty?: string | null;
  course?: number | null;
};

const FACULTY_KEYWORDS: Array<{ keywords: string[]; interests: string[] }> = [
  {
    keywords: ["fit", "it", "cs", "comp", "informatics", "инф", "айти"],
    interests: ["AI", "Программирование", "Стартапы"],
  },
  {
    keywords: ["eng", "engineer", "инжен"],
    interests: ["Инженерия", "Наука"],
  },
  {
    keywords: ["eco", "econ", "biz", "business", "фин", "эконом"],
    interests: ["Финансы", "Маркетинг", "Менеджмент"],
  },
  {
    keywords: ["med", "bio", "мед", "био"],
    interests: ["Наука", "Здоровье"],
  },
  {
    keywords: ["law", "jur", "право", "юрист"],
    interests: ["Право", "Менеджмент"],
  },
  {
    keywords: ["art", "design", "дизайн", "арт"],
    interests: ["Дизайн", "Кино"],
  },
];

export const suggestInterestsFromProfile = (profile: SuggestProfile) => {
  const faculty = profile.faculty?.toLowerCase() ?? "";
  const items: string[] = [];

  if (faculty) {
    const byCatalog = suggestInterestsByFaculty(faculty);
    byCatalog.forEach((interest) => items.push(interest));

    FACULTY_KEYWORDS.forEach((entry) => {
      if (entry.keywords.some((keyword) => faculty.includes(keyword))) {
        entry.interests.forEach((interest) => items.push(interest));
      }
    });
  }

  if (profile.course && profile.course >= 3) {
    items.push("Карьера");
  }

  const unique = Array.from(new Set(items));
  return unique;
};
