import tensorflow as tf
import numpy as np
import matplotlib.pyplot as plt
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.vgg19 import VGG19, preprocess_input


def grad_cam_plus_plus(model, img_array, layer_name="block5_conv3"):
    """
    Generate Grad-CAM++ heatmap for a given image and model.
    """
    grad_model = tf.keras.models.Model(
        inputs=model.input,  # Correctly reference the input without brackets
        outputs=[model.get_layer(layer_name).output, model.output],
    )

    with tf.GradientTape() as tape:
        conv_output, predictions = grad_model(img_array)
        class_index = tf.argmax(predictions[0])
        loss = predictions[:, class_index]

    grads = tape.gradient(loss, conv_output)
    # Work on the single-image maps (drop the batch axis) so the spatial reductions
    # are over (H, W) per channel — the correct Grad-CAM++ formulation.
    conv = conv_output[0]          # (H, W, C)
    grad = grads[0]                # (H, W, C)
    grad2 = grad * grad
    grad3 = grad2 * grad

    global_sum = tf.reduce_sum(conv, axis=(0, 1))          # sum_{ab} A^k_{ab} -> (C,)
    alpha_denom = 2.0 * grad2 + grad3 * global_sum
    alpha_denom = tf.where(alpha_denom != 0.0, alpha_denom, tf.ones_like(alpha_denom))
    alphas = grad2 / alpha_denom
    alphas /= tf.reduce_sum(alphas, axis=(0, 1)) + 1e-10   # normalise per channel over (H, W)

    weights = tf.reduce_sum(alphas * tf.maximum(grad, 0.0), axis=(0, 1))   # relu(grad) -> (C,)
    heatmap = tf.reduce_sum(weights * conv, axis=-1)       # (H, W)
    heatmap = tf.maximum(heatmap, 0)
    heatmap /= tf.reduce_max(heatmap) + 1e-10

    return heatmap.numpy()



def show_grad_cam_plus_plus(img_path, alpha=0.5):
    """
    Overlay Grad-CAM++ heatmap on the original image.
    """
    # Load and preprocess the image
    img = image.load_img(img_path, target_size=(224, 224))
    img_array = image.img_to_array(img)
    img_array_preprocessed = preprocess_input(np.expand_dims(img_array, axis=0))


    model = VGG19(weights="imagenet")


    heatmap = grad_cam_plus_plus(model, img_array_preprocessed)


    heatmap = tf.image.resize(heatmap[..., tf.newaxis], (224, 224)).numpy().squeeze()

    # Visualize
    plt.figure(figsize=(10, 5))


    plt.subplot(1, 2, 1)
    plt.imshow(img)
    plt.title("Original Image")
    plt.axis("off")


    plt.subplot(1, 2, 2)
    plt.imshow(img)
    plt.imshow(heatmap, cmap="jet", alpha=alpha) 
    plt.title("Grad-CAM++ Overlay")
    plt.axis("off")

    plt.show()

img_path = "/Users/malhar.inamdar/Downloads/MRI_blackandwhite.png"
show_grad_cam_plus_plus(img_path, alpha=0.5) 