const hero = document.getElementById('heroScientist');
const analysis = document.getElementById('analysisScientist');
const sensorPoses = {
  disconnected: 'walking',
  connecting: 'inspecting',
  waiting: 'reading',
  receiving: 'acknowledged',
  error: 'inspecting'
};

function showPose(character, pose) {
  if (character.dataset.pose !== pose) character.dataset.pose = pose;
}

export function showSensorPose(state) {
  showPose(hero, sensorPoses[state]);
}

export function showAnalysisPose(pose) {
  showPose(analysis, pose);
}