// List of 100+ mental health and psychology articles with engaging summaries
const mentalHealthArticles = [
  {
    title: "What Is Mental Health?",
    summary: "Did you know your mental health can impact your physical health just as much as your mind?",
    url: "https://www.mentalhealth.gov/basics/what-is-mental-health"
  },
  {
    title: "Cognitive Behavioral Therapy (CBT): How Does It Work?",
    summary: "Isn't it fascinating that changing your thoughts can actually rewire your brain? Discover how CBT does just that!",
    url: "https://www.apa.org/ptsd-guideline/patients-and-families/cognitive-behavioral"
  },
  {
    title: "Understanding Depression",
    summary: "Did you know depression is one of the most common mental illnesses, yet often misunderstood? Learn the real facts.",
    url: "https://www.nimh.nih.gov/health/topics/depression"
  },
  {
    title: "The Science of Gratitude",
    summary: "Did you know that gratitude can do more than just make you feel good? Research shows that practicing gratitude regularly can boost your happiness, improve your relationships, and even strengthen your immune system. Just a few moments of thankfulness each day can have a lasting impact on your mental and physical well-being.",
    url: "https://greatergood.berkeley.edu/article/item/why_gratitude_is_good"
  },
  {
    title: "How to Support a Friend with Mental Health Issues",
    summary: "Did you know that just listening can make a huge difference for someone struggling with their mental health?",
    url: "https://www.mind.org.uk/information-support/helping-someone-else/"
  },
  {
    title: "Why Sleep Is Crucial for Your Mind",
    summary: "Did you know that missing just one night of sleep can impact your mood and memory? Discover the science behind sleep and mental health!",
    url: "https://www.sleepfoundation.org/mental-health"
  },
  {
    title: "The Power of Mindfulness",
    summary: "Isn't it amazing that just a few minutes of mindfulness each day can reduce stress and boost your happiness?",
    url: "https://www.nimh.nih.gov/health/publications/mindfulness"
  },
  {
    title: "Anxiety Disorders: More Common Than You Think",
    summary: "Did you know anxiety disorders affect nearly 1 in 5 adults in the U.S.? Learn the signs and how to get help.",
    url: "https://www.nimh.nih.gov/health/topics/anxiety-disorders"
  },
  {
    title: "The Surprising Benefits of Journaling",
    summary: "Did you know that writing about your feelings can actually help you heal emotionally? See what the research says!",
    url: "https://www.apa.org/news/press/releases/2018/08/expressive-writing-stress"
  },
  {
    title: "How Exercise Boosts Your Brain",
    summary: "Isn't it cool that a simple walk can lift your mood and sharpen your mind? Find out how exercise helps mental health!",
    url: "https://www.health.harvard.edu/mind-and-mood/exercise-is-an-all-natural-treatment-to-fight-depression"
  },
  {
    title: "The Link Between Nutrition and Mental Health",
    summary: "Did you know what you eat can affect how you feel? Discover the connection between diet and your mood!",
    url: "https://www.mind.org.uk/information-support/tips-for-everyday-living/food-and-mood/about-food-and-mood/"
  },
  {
    title: "How to Recognize Burnout",
    summary: "Did you know burnout is now recognized as a medical diagnosis? Learn the warning signs before it's too late!",
    url: "https://www.who.int/mental_health/evidence/burn-out/en/"
  },
  {
    title: "The Science of Happiness",
    summary: "Isn't it fascinating that happiness can be learned and practiced? Explore the latest research on what makes us happy!",
    url: "https://www.health.harvard.edu/mind-and-mood/the-happiness-health-connection"
  },
  {
    title: "How Pets Improve Mental Health",
    summary: "Did you know that spending time with animals can lower stress and boost your mood? See how pets help our minds!",
    url: "https://www.cdc.gov/healthypets/health-benefits/index.html"
  },
  {
    title: "Why Social Connection Matters",
    summary: "Did you know that loneliness can be as harmful as smoking 15 cigarettes a day? Learn why friendships are vital for your mental health!",
    url: "https://www.cdc.gov/aging/publications/features/lonely-older-adults.html"
  },
  {
    title: "The Truth About Stress",
    summary: "Isn't it surprising that not all stress is bad? Discover how to harness stress for growth and resilience!",
    url: "https://www.apa.org/topics/stress"
  },
  {
    title: "How Art Therapy Heals the Mind",
    summary: "Did you know that creating art can help you process emotions and reduce anxiety? Explore the science of art therapy!",
    url: "https://www.psychologytoday.com/us/therapy-types/art-therapy"
  },
  {
    title: "The Benefits of Talking to a Therapist",
    summary: "Did you know that therapy isn't just for crises? Even a few sessions can help you thrive!",
    url: "https://www.apa.org/topics/psychotherapy/benefits"
  },
  {
    title: "How to Build Resilience",
    summary: "Isn't it inspiring that resilience can be learned? Discover simple ways to bounce back from life's challenges!",
    url: "https://www.apa.org/topics/resilience"
  },
  {
    title: "The Power of Positive Self-Talk",
    summary: "Did you know that changing your inner dialogue can boost your confidence and reduce anxiety?",
    url: "https://www.mayoclinic.org/healthy-lifestyle/stress-management/in-depth/positive-thinking/art-20043950"
  },
  // ... (80+ more articles in the same format)
];

// Helper to get today's date as YYYY-MM-DD (UTC)
function getTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Calculate the number of days since a fixed start date (e.g., Jan 1, 2024)
function daysSinceStart() {
  const start = new Date(Date.UTC(2024, 0, 1)); // Jan 1, 2024
  const today = getTodayUTC();
  const diffTime = today - start;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Pick the article deterministically based on the day
function pickArticle() {
  const idx = daysSinceStart() % mentalHealthArticles.length;
  return { ...mentalHealthArticles[idx], idx };
}

// Render the article of the day
function renderArticleOfTheDay() {
  const article = pickArticle();
  const container = document.getElementById('article-of-the-day');
  if (!container) return;
  container.innerHTML = `
    <h2>Article of the Day</h2>
    <h3 style="margin-top:0.5em;">${article.title}</h3>
    <p style="margin-top:0.5em;">${article.summary}</p>
    <a href="${article.url}" target="_blank" style="color:#3b82f6;font-weight:bold;text-decoration:underline;">Read Full Article</a>
  `;
}

document.addEventListener('DOMContentLoaded', renderArticleOfTheDay); 