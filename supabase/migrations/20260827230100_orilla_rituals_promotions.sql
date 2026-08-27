-- Seed Orilla weekly rituals as visible guest-page promotions.

INSERT INTO public.guest_feedback_promotions (
  venue_id, title, description, value_label, visible, sort_order
)
SELECT
  v.id,
  d.title,
  d.description,
  d.value_label,
  true,
  d.sort_order
FROM public.venues v
CROSS JOIN (
  VALUES
    (
      'Sunset Rituals',
      'Weekdays, 4 PM – 8 PM. Selected beverages.',
      '40 AED',
      10
    ),
    (
      'After Shift',
      'Mon & Tue, 6 PM – 1 AM. For cabin crew, teachers, real estate, and hospitality.',
      '3 for 100 AED',
      20
    ),
    (
      'Sushi Night',
      'Tuesdays, 7 PM – 10 PM. All-you-can-eat sushi.',
      '185 AED PP',
      30
    ),
    (
      'Mi Amor',
      'Wednesdays, 8 PM – 1 AM. Ladies receive complimentary wine at the bar. Live DJ.',
      'Complimentary wine',
      40
    ),
    (
      'Neighborhood Nights',
      'Fridays, 6 PM onwards. Community socialising evening. 3-course dinner.',
      '150 AED',
      50
    ),
    (
      'Viva Orilla',
      'Weekends, 12:30 PM – 4 PM. 3-course brunch & open bar. Live DJ.',
      'From 375 AED',
      60
    ),
    (
      'R&B Sundays',
      'Every 2nd Sunday, 4 PM – 10 PM. Entrance includes a 2-course menu. Live DJ.',
      '160 AED',
      70
    ),
    (
      'Dubai Restaurant Week',
      'Till 31st May. Lunch: 2 courses for 125 AED. Dinner: 3 courses for 250 AED.',
      'From 125 AED',
      80
    )
) AS d(title, description, value_label, sort_order)
WHERE v.slug = 'orilla'
  AND NOT EXISTS (
    SELECT 1
    FROM public.guest_feedback_promotions p
    WHERE p.venue_id = v.id
      AND p.title = d.title
  );
