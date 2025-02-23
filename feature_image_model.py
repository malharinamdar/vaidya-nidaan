import numpy as np
import pandas as pd
import os
from tensorflow.keras.models import load_model, Model
from tensorflow.keras.layers import Input, Dense, Concatenate
from tensorflow.keras.preprocessing.image import load_img, img_to_array
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from tensorflow.keras.utils import to_categorical


IMG_SIZE = (128, 128)  # Resize images to 224x224 for ResNet
image_folder = "/home/user/techfiesta/alzheimer_data"  # Update this path

# Define the dementia categories based on folder names
dementia_classes = ["Non Demented", "Very mild Dementia", "Mild Dementia", "Moderate Dementia"]
class_to_label = {cls: idx for idx, cls in enumerate(dementia_classes)}

X_images = []
image_filenames = []
y_labels = []  # Collect labels here

for category in os.listdir(image_folder):
    category_path = os.path.join(image_folder, category)

    if not os.path.isdir(category_path) or category not in class_to_label:
        continue  # Skip files and unknown folders

    for img_name in os.listdir(category_path):
        img_path = os.path.join(category_path, img_name)

        if img_name.lower().endswith((".jpg", ".jpeg", ".png")):
            try:
                # Load and preprocess image
                img = load_img(img_path, target_size=IMG_SIZE)
                img_array = img_to_array(img) / 255.0
                X_images.append(img_array)
                image_filenames.append(img_name.split(".")[0])  # Store image ID

                # Assign label based on folder name
                y_labels.append(class_to_label[category])
            except Exception as e:
                print(f"Error loading {img_path}: {e}")

X_images = np.array(X_images)
y_labels = np.array(y_labels)
y_labels = to_categorical(y_labels, num_classes=4)  # One-hot encode labels

# Load tabular data
df = pd.read_csv("/home/user/techfiesta/dementia.csv")

features = ["ID", "Age", "Gender", "Smoker", "Alcohol Consumption", "Any Previous Neurological Condition"]
X_tabular = df[features]

# Filter out patients without images
df = df[df["ID"].astype(str).isin(image_filenames)]

# Encode categorical variables
categorical_features = ["Gender", "Smoker", "Alcohol Consumption", "Any Previous Neurological Condition"]
encoder = OneHotEncoder(sparse_output=False)
X_cat = encoder.fit_transform(X_tabular[categorical_features])

# Standardize numerical values (Age)
scaler = StandardScaler()
X_num = scaler.fit_transform(X_tabular[["Age"]])

# Combine numerical and categorical data
X_tabular_processed = np.hstack([X_num, X_cat])

# Load existing ResNet-based model
cnn_model = load_model(
    "/home/user/techfiesta/alzheimer_model.h5"
)

# Update the image input to match shape (224, 224, 3)
updated_image_input = Input(shape=(128, 128, 3), name="updated_image_input")
updated_image_features = cnn_model(updated_image_input)

# Define tabular data input
tabular_input = Input(shape=(X_tabular_processed.shape[1],), name="tabular_input")

# Process tabular input using Dense layers
tabular_features = Dense(32, activation="relu", name="tabular_dense_1")(tabular_input)

# Merge image features and tabular features
merged = Concatenate(name="concat_layer")([updated_image_features, tabular_features])

# Assign unique names to the Dense layers to avoid conflict
# Rename layers with unique names to avoid conflicts
x = Dense(128, activation="relu", name="merged_dense_1")(merged)
x = Dense(64, activation="relu", name="merged_dense_2")(x)
output = Dense(4, activation="softmax", name="merged_output")(x)


# Create the updated model
updated_model = Model(inputs=[updated_image_input, tabular_input], outputs=output)


updated_model.compile(
    optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"]
)


updated_model.summary()


updated_model.fit(
    [X_images, X_tabular_processed],  # Inputs: Images + Metadata
    y_labels,  # Output: Dementia classification
    epochs=10,
    batch_size=32,
    validation_split=0.2,
)

updated_model.save(
    "/home/user/techfiesta/final_alzheimer.h5"
)
