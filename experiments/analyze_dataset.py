import json
import numpy as np
import matplotlib.pyplot as plt
import os
from collections import defaultdict

def load_data(filepath):
    print(f"Loading data from {filepath}...")
    with open(filepath, 'r') as f:
        data = json.load(f)
    print(f"Loaded {len(data)} sequences.")
    return data

def analyze_and_plot(data, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    
    # Organize data by string
    strings_data = defaultdict(list)
    for entry in data:
        string_num = entry.get('stringNum')
        # We can look at the mean of the features across the frames in the sequence
        features = np.array(entry.get('normalizedFeatures', entry.get('features')))
        if features.size == 0:
            continue
        # Average over time frames for simple visualization
        mean_features = np.mean(features, axis=0)
        strings_data[string_num].append(mean_features)
    
    # Feature names based on the 18-feature layout (MFCC 0-12, Note, Centroid, Flux, Rolloff, Inharm)
    num_mfcc = 13
    feature_names = [f"MFCC_{i}" for i in range(num_mfcc)]
    extra_features = [
        "Midi Note",
        "Spectral Centroid",
        "Spectral Flux",
        "Spectral Rolloff",
        "Inharmonicity"
    ]
    feature_names.extend(extra_features)
    
    string_names = {
        0: "High E (0)",
        1: "B (1)",
        2: "G (2)",
        3: "D (3)",
        4: "A (4)",
        5: "Low E (5)"
    }
    
    # Plot 1: Average MFCCs per string
    plt.figure(figsize=(10, 6))
    for string_num, features_list in sorted(strings_data.items()):
        features_np = np.array(features_list)
        avg_mfccs = np.mean(features_np[:, :num_mfcc], axis=0)
        plt.plot(range(num_mfcc), avg_mfccs, marker='o', label=string_names.get(string_num, f"String {string_num}"))
    
    plt.title("Average MFCCs per String")
    plt.xlabel("MFCC Coefficient")
    plt.ylabel("Average Value (Normalized if available)")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    mfcc_plot_path = os.path.join(output_dir, 'avg_mfccs.png')
    plt.savefig(mfcc_plot_path)
    print(f"Saved: {mfcc_plot_path}")
    plt.close()

    # Determine how many features we actually have (to support slightly different datasets/shapes)
    actual_num_features = min(
        len(feature_names), 
        max([np.array(lst).shape[1] for lst in strings_data.values() if len(lst) > 0])
    )
    
    # Plot 2: Boxplots for each extra feature across strings
    for i in range(num_mfcc, actual_num_features):
        plt.figure(figsize=(8, 5))
        data_to_plot = []
        labels = []
        for string_num, features_list in sorted(strings_data.items()):
            features_np = np.array(features_list)
            if features_np.shape[1] > i:
                data_to_plot.append(features_np[:, i])
                labels.append(string_names.get(string_num, f"String {string_num}"))
        
        if data_to_plot:
            # Use boxplot to show distribution
            plt.boxplot(data_to_plot, tick_labels=labels)
            plt.title(f"Distribution of {feature_names[i]} across Strings")
            plt.ylabel("Value (Normalized if available)")
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            
            safe_name = feature_names[i].replace(" ", "_").lower()
            plot_path = os.path.join(output_dir, f'dist_{safe_name}.png')
            plt.savefig(plot_path)
            print(f"Saved: {plot_path}")
        plt.close()
        
    print(f"\nAll plots have been successfully saved to the '{output_dir}' directory.")

if __name__ == "__main__":
    # Path to your JSON dataset
    current_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(current_dir, "guitar_dataset.json")
    
    output_dir = os.path.join(current_dir, "analysis_plots")
    
    if not os.path.exists(filepath):
        print(f"Error: Dataset not found at {filepath}")
        print("Please ensure the guitar_dataset.json file exists in the same directory as this script.")
    else:
        dataset = load_data(filepath)
        analyze_and_plot(dataset, output_dir)
