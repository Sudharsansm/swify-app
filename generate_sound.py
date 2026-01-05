import wave
import math
import struct
import random

def generate_bird_sound(filename, duration=5.0, sample_rate=44100):
    n_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        
        # A bird chirp is a quick frequency sweep
        # We will create a pattern of chirps
        
        chirp_duration = 0.15 # seconds
        silence_duration = 0.4 # seconds between chirps
        
        current_time = 0.0
        
        for i in range(n_samples):
            t = float(i) / sample_rate
            
            # Create a repeating pattern of 2-3 chirps then a pause
            cycle_time = t % 2.0 # 2 second loop
            
            sample_value = 0.0
            
            # Define chirp timings within the 2s cycle
            # Chirp 1: 0.0 - 0.15
            # Chirp 2: 0.25 - 0.40
            # Chirp 3: 0.50 - 0.65
            
            active = False
            local_t = 0
            
            if 0.0 <= cycle_time < 0.15:
                active = True
                local_t = cycle_time
            elif 0.25 <= cycle_time < 0.40:
                active = True
                local_t = cycle_time - 0.25
            elif 0.50 <= cycle_time < 0.65:
                active = True
                local_t = cycle_time - 0.50
                
            if active:
                # Frequency sweep for a chirp (e.g., 2000Hz -> 1000Hz)
                # FM Synthesis: Amplitude * sin(2 * pi * (start_freq + sweep) * t)
                
                # We modulate the phase to simulate frequency sweep
                # Instantaneous Freq = 2500 - (1500 * (local_t / chirp_duration))
                
                # High pitch sine wave with slide
                freq_start = 3000.0
                freq_end = 1500.0
                
                prog = local_t / chirp_duration
                current_freq = freq_start + (freq_end - freq_start) * prog
                
                # Amplitude envelope (Attack/Release) to avoid clicks
                amp = 1.0
                if prog < 0.1: amp = prog / 0.1
                elif prog > 0.8: amp = (1.0 - prog) / 0.2
                
                # Main Sine
                sample_value = 0.3 * amp * math.sin(2 * math.pi * current_freq * local_t)
                
                # Add a second harmonic for "whistle" texture
                sample_value += 0.1 * amp * math.sin(2 * math.pi * (current_freq * 2) * local_t)

            value = int(32767.0 * sample_value)
            data = struct.pack('<h', value)
            wav_file.writeframesraw(data)

if __name__ == "__main__":
    print("Generating bird chirping sound...")
    generate_bird_sound('static/sounds/notification.wav')
    print("Done.")
