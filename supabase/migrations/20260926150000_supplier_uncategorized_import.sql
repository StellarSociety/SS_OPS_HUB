-- Add an Uncategorized supplier queue and import the September 2026 supplier list.
-- Existing suppliers keep their list/account/tax settings; only name and nickname
-- are refreshed. New names start uncategorized and move when edited into a list.

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_kind_check;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_kind_check
  CHECK (kind IN ('cos', 'opex_general', 'opex', 'uncategorized'));

CREATE TEMP TABLE supplier_import_20260926 (
  name TEXT PRIMARY KEY,
  nickname TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO supplier_import_20260926 (name, nickname) VALUES
  ('African & Eastern (Near East) (Bvi) Limited', 'African Eastern'),
  ('Artisan Ice Co', 'Artisan Ice'),
  ('Clear Ice Llc', 'Clear Ice'),
  ('Coca-Cola Al Ahlia Beverages Company Llc', 'Coca-Cola'),
  ('Emirates Snack Foods Llc', 'Emirates Snack'),
  ('Geralt Me Llc', 'Geralt ME'),
  ('Maritime & Mercantile International Llc', 'MMI'),
  ('Alarwa Food Industries Llc', 'Alarwa Food'),
  ('Chef 2 Chef Llc', 'Chef 2 Chef'),
  ('Chef Middle East Llc', 'Chef Middle East'),
  ('Chefs Touch Foodstuff Trading Llc', 'Chefs Touch'),
  ('Food Source International', 'Food Source'),
  ('Fresh Express Llc', 'Fresh Express'),
  ('Freshon Table Dwc Llc', 'Freshon Table'),
  ('Gianni And Gelato General Trading Llc', 'Gianni Gelato'),
  ('Heidi Chef Solutions Llc', 'Heidi Chef'),
  ('Horeca Trade Llc(Bid Food)', 'Bidfood'),
  ('Hubit General Trading Llc', 'Hubit'),
  ('M.H. Enterprises Llc', 'MH Enterprises'),
  ('Simply Gourmet Foodstuff Trading Llc', 'Simply Gourmet'),
  ('Tezukuri Restaurant Llc', 'Tezukuri'),
  ('Wisk Foodstuff Trading Llc / Wisk Investments Llc', 'Wisk'),
  ('Zois Fine Food And Beverages Trading Llc', 'Zois Fine Food'),
  ('1765 Gemini Llc', '1765 Gemini'),
  ('Abrao Trading Llc', 'Abrao Trading'),
  ('Action Paintball Sports & Amusement Tracks Llc', 'Action Paintball'),
  ('Adcb Merchant Services', 'ADCB Merchant'),
  ('Al Hoty - Stanger Laboratories', 'Al Hoty'),
  ('Al Kabayel Oasis Trading', 'Al Kabayel'),
  ('Al Zaman Fashion Co. Llc', 'Al Zaman'),
  ('Alea Investment Llc', 'Alea Investment'),
  ('Alliance Insurance Psc', 'Alliance Insurance'),
  ('Amazone', 'Amazone'),
  ('Ameena Design', 'Ameena Design'),
  ('Art Aura Productions', 'Art Aura'),
  ('Be Wtr Trading Llc', 'BE WTR'),
  ('Bragard Llc', 'Bragard'),
  ('Brother International Fz Llc', 'Brother International'),
  ('Canary Clu Dubai', 'Canary Clu'),
  ('Cassa Corporate Services Llc', 'Cassa Corporate'),
  ('Chaine Emirates Fz Llc', 'Chaine Emirates'),
  ('Chika Fze Llc', 'Chika'),
  ('Color Pack Paper Industry Llc', 'Color Pack'),
  ('Colourline Computer Designing Services', 'Colourline Computer'),
  ('Computer Quest Llc', 'Computer Quest'),
  ('Dda Public Relations', 'DDA Public'),
  ('Desco Copy Centre Llc - Uae', 'Desco Copy'),
  ('Design Infinity L.L.C', 'Design Infinity'),
  ('Domus Properties Llc', 'Domus Properties'),
  ('Dubai Muncipality', 'Dubai Municipality'),
  ('Eastern Connection Fz Lle', 'Eastern Connection'),
  ('Econo Pack Goods Wholesalers Co. L.L.C', 'Econo Pack'),
  ('Ecopack Llc', 'Ecopack'),
  ('El Primero For Tobacco & Cigarette Trading Co. Llc', 'El Primero'),
  ('Elite Horizon General Trading Llc', 'Elite Horizon'),
  ('Elseptimo Tовассо And Cigarettes Trading Llc', 'Elseptimo Tobacco'),
  ('Em Tec Fz Llc', 'EM Tec'),
  ('Emirates Integrated Telecommunication (Du)', 'Emirates Du'),
  ('Enviro Care Cleaning Services L.L.C.', 'Enviro Care'),
  ('Everstyle Trading Llc', 'Everstyle Trading'),
  ('Fine City Landscape Llc', 'Fine City'),
  ('Gamma 1 Limited', 'Gamma 1'),
  ('Gitex For Computer Systems & Communication Equipment Software Trading Co. L', 'Gitex Computer'),
  ('Global Link Corporate Services Provide L.L.C', 'Global Link'),
  ('Government Of Dubai', 'Government Dubai'),
  ('Hawkseye Caliberation Llc', 'Hawkseye'),
  ('High Force Concrete Llc', 'High Force'),
  ('Home Center Dubai', 'Home Center'),
  ('Home Centre', 'Home Centre'),
  ('Imbued General Trading Llc', 'Imbued General'),
  ('Indigo Hospitality Supplies Llc', 'Indigo Hospitality'),
  ('Ipaq Computers Llc', 'Ipaq Computers'),
  ('Kfc', 'KFC'),
  ('Kitchen Master D & D Trading Llc', 'Kitchen Master'),
  ('Lehmann Glass Llc', 'Lehmann Glass'),
  ('Lillian Grey', 'Lillian Grey'),
  ('M H Alshaya Co Llc', 'MH Alshaya'),
  ('Mainstay Global Fze', 'Mainstay Global'),
  ('Mais Matte Production Co', 'Mais Matte'),
  ('Meta Platforms Ireland Limited', 'Meta Platforms'),
  ('Mg Hotels Supplies Llc', 'MG Hotels'),
  ('Molton Bro Dubai', 'Molton Bro'),
  ('Montreal Trading Llc', 'Montreal Trading'),
  ('Nara Nara Tobacco Trading Co. Llc', 'Nara Nara'),
  ('Niuvio Agency', 'Niuvio Agency'),
  ('Noor Al Sama Kitchens Equipment Llc', 'Noor Al Sama'),
  ('Nordica Uniforms Trading Llc', 'Nordica Uniforms'),
  ('One To Dubai', 'One To'),
  ('Orient Printing Press & Stationery L.L.C.', 'Orient Printing'),
  ('Palmiye Shading Smart Systems', 'Palmiye Shading'),
  ('Pan Arabian Rent A Car Llc', 'Pan Arabian'),
  ('Paperchase Accountancy Llc', 'Paperchase'),
  ('Pearl Oasis Typing And Photocopying', 'Pearl Oasis'),
  ('Pesco Environmental Services Llc', 'Pesco Environmental'),
  ('Petty Cash - Orilla', 'Petty Cash'),
  ('Pinnacle Stamps And Advertising', 'Pinnacle Stamps'),
  ('Plp Events Llc', 'PLP Events'),
  ('Proactive Computers Llc', 'Proactive Computers'),
  ('Qlub Fast Technology Services Fzco', 'Qlub'),
  ('Quality Middle East', 'Quality Middle East'),
  ('Quintal Do Ale Entertainment Fz-Llc', 'Quintal Do Ale'),
  ('Reemflora Dubai', 'Reemflora'),
  ('Restofair Rak Llc', 'Restofair RAK'),
  ('Royal Green House Trading Llc', 'Royal Green'),
  ('Royal Horeca Supplies General Trading Llc', 'Royal Horeca'),
  ('Royal Purple Roastry Llc', 'Royal Purple'),
  ('Safer Fire Safety Consultancy', 'Safer Fire'),
  ('Seamax', 'Seamax'),
  ('Serraa Digital Marketing Est', 'Serraa Digital'),
  ('Servpro Llc Fz', 'Servpro'),
  ('Shishazone Tobacco Trade And Smoking Supplies Llc', 'Shishazone'),
  ('Silver Arcade Linen Llc', 'Silver Arcade'),
  ('Smart Dubai Government', 'Smart Dubai'),
  ('Stellar Society Group Holding Ltd.', 'Stellar Society'),
  ('Stellar Society Restaurent Management Llc', 'Stellar Restaurant'),
  ('Stocktake Online Ltd - Uae', 'Stocktake Online'),
  ('Stocktake Uk Ltd', 'Stocktake UK'),
  ('Strategic Partnership Solutions', 'Strategic Partnership'),
  ('Temu', 'Temu'),
  ('Tevalis Middle East Software', 'Tevalis Middle East'),
  ('TFG Property Management', 'TFG Property'),
  ('The Cinematic House', 'Cinematic House'),
  ('The Entertainer Fz Llc', 'The Entertainer'),
  ('The Secret Society', 'Secret Society'),
  ('Tiger Force Facility Management Llc', 'Tiger Force'),
  ('Urban Décor Trading Fz L.L.C', 'Urban Décor'),
  ('Vivi International Fze', 'Vivi International'),
  ('Wadi Al Arz Laundry', 'Wadi Al Arz'),
  ('Yantai C&C Trading Fze', 'Yantai C&C'),
  ('Zafar Ali Interior And Decoration Works', 'Zafar Ali'),
  ('Zoho Software Trading Llc', 'Zoho Software');

DO $$
DECLARE
  target_venue_id UUID;
  target_entity_id UUID;
BEGIN
  SELECT v.id, ve.entity_id
    INTO target_venue_id, target_entity_id
  FROM public.venues v
  JOIN public.venue_entities ve ON ve.venue_id = v.id
  WHERE lower(v.slug) = 'orilla'
  LIMIT 1;

  IF target_venue_id IS NULL OR target_entity_id IS NULL THEN
    RAISE EXCEPTION 'Orilla venue/entity mapping not found';
  END IF;

  WITH candidates AS (
    SELECT
      i.name AS imported_name,
      i.nickname AS imported_nickname,
      s.id AS supplier_id,
      row_number() OVER (
        PARTITION BY i.name
        ORDER BY
          CASE
            WHEN regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') =
                 regexp_replace(lower(i.name), '[^a-z0-9]', '', 'g') THEN 0
            WHEN regexp_replace(lower(coalesce(s.nickname, '')), '[^a-z0-9]', '', 'g') =
                 regexp_replace(lower(i.nickname), '[^a-z0-9]', '', 'g') THEN 1
            ELSE 2
          END,
          abs(length(s.name) - length(i.name)),
          s.created_at
      ) AS match_rank
    FROM supplier_import_20260926 i
    JOIN public.suppliers s
      ON s.venue_id = target_venue_id
     AND (
       regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') =
         regexp_replace(lower(i.name), '[^a-z0-9]', '', 'g')
       OR (
         least(
           length(regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g')),
           length(regexp_replace(lower(i.name), '[^a-z0-9]', '', 'g'))
         ) >= 7
         AND (
           regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') LIKE
             regexp_replace(lower(i.name), '[^a-z0-9]', '', 'g') || '%'
           OR regexp_replace(lower(i.name), '[^a-z0-9]', '', 'g') LIKE
             regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') || '%'
         )
       )
       OR (
         s.nickname IS NOT NULL
         AND regexp_replace(lower(s.nickname), '[^a-z0-9]', '', 'g') =
             regexp_replace(lower(i.nickname), '[^a-z0-9]', '', 'g')
       )
       OR (
         i.name = 'Horeca Trade Llc(Bid Food)'
         AND lower(coalesce(s.nickname, '')) = 'bidfood'
       )
     )
  ), best_matches AS (
    SELECT imported_name, imported_nickname, supplier_id
    FROM candidates
    WHERE match_rank = 1
  )
  UPDATE public.suppliers s
  SET
    name = m.imported_name,
    nickname = m.imported_nickname,
    updated_at = now()
  FROM best_matches m
  WHERE s.id = m.supplier_id;

  INSERT INTO public.suppliers (
    entity_id,
    venue_id,
    name,
    nickname,
    kind,
    payment_terms_days,
    active,
    created_at,
    updated_at
  )
  SELECT
    target_entity_id,
    target_venue_id,
    i.name,
    i.nickname,
    'uncategorized',
    30,
    true,
    now(),
    now()
  FROM supplier_import_20260926 i
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.venue_id = target_venue_id
      AND regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') =
          regexp_replace(lower(i.name), '[^a-z0-9]', '', 'g')
  );
END $$;
