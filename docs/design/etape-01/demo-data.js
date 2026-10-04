/* Scénario fictif de conception. Aucun échantillon matériel, aucune donnée personnelle. */
window.FITNESS_DEMO = (() => {
  const blocks = [
    {name:'Échauffement', minutes:5, speed:6, incline:0},
    ...Array.from({length:4}, (_,i)=>[
      {name:`Course ${i+1}`, minutes:3, speed:8, incline:1},
      {name:`Récupération ${i+1}`, minutes:2, speed:6, incline:0}
    ]).flat(),
    {name:'Retour au calme', minutes:5, speed:5, incline:0}
  ];
  let start=0;
  blocks.forEach(b=>{b.start=start; start+=b.minutes*60; b.end=start;});
  const samples=Array.from({length:181}, (_,i)=>{
    const second=i*10;
    const block=blocks.find(b=>second>=b.start&&second<b.end)||blocks.at(-1);
    const missing=second>=720&&second<740;
    return {second,target:block.speed,speed:missing?null:Number((block.speed-0.08+0.06*Math.sin(i*1.8)).toFixed(2)),incline:missing?null:block.incline,heartRate:null};
  });
  const history = [
    {date:'7 sept.',day:'2026-09-07',minutes:30}, {date:'9 sept.',day:'2026-09-09',minutes:30},
    {date:'14 sept.',day:'2026-09-14',minutes:30}, {date:'16 sept.',day:'2026-09-16',minutes:25}, {date:'18 sept.',day:'2026-09-18',minutes:20},
    {date:'21 sept.',day:'2026-09-21',minutes:25}, {date:'23 sept.',day:'2026-09-23',minutes:25},
    {date:'26 sept.',day:'2026-09-26',minutes:30,km:3.22,rpe:null},
    {date:'28 sept.',day:'2026-09-28',minutes:30,km:3.25,rpe:6},
    {date:'30 sept.',day:'2026-09-30',minutes:30,km:3.28,rpe:5},
    {date:'2 oct.',day:'2026-10-02',minutes:30,km:3.30,rpe:5}
  ];
  const starts=['2026-09-07','2026-09-14','2026-09-21','2026-09-28'];
  const weeks=starts.map((from,i)=>history.filter(s=>s.day>=from&&s.day<(starts[i+1]||'2026-10-05')).reduce((n,s)=>n+s.minutes,0));
  const weekly=Array.from({length:7},(_,i)=>history.filter(s=>s.day===['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'][i]).reduce((n,s)=>n+s.minutes,0));
  return Object.freeze({blocks,samples,activeSeconds:1800,wallSeconds:1920,history,
    gap:[720,740],pauseAt:840,pauseSeconds:120,
    distanceKm:3.28,plannedDistanceKm:Number(blocks.reduce((s,b)=>s+b.speed*b.minutes/60,0).toFixed(2)),
    coverage:((1800-20)/1800*100).toFixed(1),
    weekly,weeks,sessions:history.filter(s=>s.km!==undefined).slice().reverse()
  });
})();
