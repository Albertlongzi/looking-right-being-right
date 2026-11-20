export const demoConfig = {
  captureId: '47204578',
  inputFrame: 'assets/frame.png',
  inputVideo: 'assets/video.mp4',
  scan: 'assets/scan.json',
  points: 'assets/points.json',
  cameraTrajectory: 'assets/camera_track.json',
  models: [{id:'terra',label:'Terra',fullName:'GPT-6.1 Terra'},{id:'sol',label:'Sol',fullName:'GPT-6.1 Sol'},{id:'astra',label:'Astra',fullName:'GPT-6 Astra'}],
  conditions: [
    {id:'C0', label:'Video only', subtitle:'Reconstructed from video', scene:'assets/scene_C0_occluded.json', appearance:'assets/view_C0.png'},
    {id:'C2', label:'+ Estimated points', subtitle:'Video with estimated geometry', scene:'assets/scene_C2_occluded.json', appearance:'assets/view_C2.png'}
  ]
};
