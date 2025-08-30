// הפונקציה תרוץ מיד כשהדף נטען
window.addEventListener('DOMContentLoaded', () => {
  fetchExercises();
});

// פונקציה שמביאה את התרגילים מהשרת
async function fetchExercises() {
  try {
    // מבצעים בקשת GET ל-API שבנינו
    const response = await fetch('/api/exercises');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const exercises = await response.json();

    // מציגים את התרגילים על המסך
    displayExercises(exercises);
  } catch (error) {
    console.error('Failed to fetch exercises:', error);
  }
}

// פונקציה שמקבלת את רשימת התרגילים ומציגה אותם ככרטיסיות
function displayExercises(exercises) {
  const listElement = document.getElementById('exercises-list');
  listElement.innerHTML = ''; // מנקה את הרשימה למקרה שיש תוכן ישן

  if (exercises.length === 0) {
    listElement.innerHTML = '<p>עדיין לא נוספו תרגילים למאגר.</p>';
    return;
  }

  exercises.forEach(exercise => {
    // יוצרים אלמנט HTML חדש (כרטיסייה) עבור כל תרגיל
    const card = document.createElement('div');
    card.className = 'exercise-card';

    // מכניסים את תוכן התרגיל לכרטיסייה
    card.innerHTML = `
      <h3>${exercise.category}</h3>
      <h2>${exercise.name}</h2>
      <p>${exercise.description || 'אין תיאור זמין'}</p>
    `;

    // מוסיפים את הכרטיסייה שיצרנו לרשימה שבדף
    listElement.appendChild(card);
  });
}