class SpotiesElement extends HTMLElement {
    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    }

    imgUrlToBase64(url) {
        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.onload = () => {
                this.toBase64(xhr.response).then((res) => resolve(res));
            };
            xhr.onerror = (error) => reject(error);
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            xhr.send();
        });
    }

    base64toBlob(base64Data, contentType) {
        contentType = contentType || '';
        var sliceSize = 1024;
        var byteCharacters = atob(base64Data);
        var bytesLength = byteCharacters.length;
        var slicesCount = Math.ceil(bytesLength / sliceSize);
        var byteArrays = new Array(slicesCount);

        for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
            var begin = sliceIndex * sliceSize;
            var end = Math.min(begin + sliceSize, bytesLength);

            var bytes = new Array(end - begin);
            for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
                bytes[i] = byteCharacters[offset].charCodeAt(0);
            }
            byteArrays[sliceIndex] = new Uint8Array(bytes);
        }
        return new Blob(byteArrays, { type: contentType });
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.src = src;
            image.onload = () => {
                resolve(image);
            }
            image.onerror = () => {
                reject();
            }
        });
    }

    incrementColor(color, step) {
        var colorToInt = parseInt(color.substr(1), 16);
        colorToInt += step;
        var ncolor = colorToInt.toString(16);
        ncolor = '#' + (new Array(7 - ncolor.length).join(0)) + ncolor;
        if (/^#[0-9a-f]{6}$/i.test(ncolor)) {
            return ncolor;
        }
        return color;
    };

    async getSpotifyCode(spotify_uri, remove_background = false, remove_padding = false, color = 'black', background_color = '#ffffff', width = 1080) {
        const get_color = color == 'white' ? 'white' : 'black';
        let bg_color = background_color;
        if (remove_background) {
            switch (color) {
                case 'black':
                case '#000000':
                    bg_color = '#000001';
                    break;
                case 'white':
                case '#ffffff':
                    bg_color = '#fffffe';
                    break;
                default:
                    bg_color = this.incrementColor(color, 1);
                    break;
            }
        }
        const code_url = `https://scannables.scdn.co/uri/plain/png/${bg_color.replace('#', '')}/${get_color}/${width}/${spotify_uri}`;
        let src = await this.imgUrlToBase64(code_url);
        if (remove_padding) {
            const image = await this.loadImage(src);
            const padding = 54;
            const canvas = document.createElement("canvas");
            canvas.width = image.width - (padding * 2);
            canvas.height = image.height - (padding * 2);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, padding, padding, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
            src = canvas.toDataURL();
        }
        if (remove_background) {
            const image = await this.loadImage(src);
            src = this.replaceColorInImage(image, this.hexToRgb(bg_color), { r: 0, g: 0, b: 0, a: 0 });
        }
        if (color != 'white' && color != 'black') {
            const image = await this.loadImage(src);
            const remove_color = this.hexToRgb(bg_color === 'white' ? '#ffffff' : '#000000');
            src = this.replaceColorInImage(image, remove_color, this.hexToRgb(color));
        }
        return src;
    };

    replaceColorInImage(image, old_color, new_color) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        const imgd = ctx.getImageData(0, 0, image.width, image.height);
        const pix = imgd.data;

        for (let i = 0, n = pix.length; i < n; i += 4) {
            const r = pix[i],
                g = pix[i + 1],
                b = pix[i + 2];

            if (r == old_color.r && g == old_color.g && b == old_color.b) {
                pix[i] = new_color.r;
                pix[i + 1] = new_color.g;
                pix[i + 2] = new_color.b;
                pix[i + 3] = new_color.a != undefined ? new_color.a : pix[i + 3];
            }
        }
        ctx.putImageData(imgd, 0, 0);
        return canvas.toDataURL();
    }
}

class SpotiesSearch extends SpotiesElement {
    constructor() {
        super();

        this.required = this.hasAttribute('required');
        this.search_field = this.querySelector('#spoties-search');
        this.search_type_field = this.querySelector('select');
        this.search_results_container = this.querySelector('.search__results__container');
        this.search_results = this.search_results_container.querySelector('div');
        this.load_more_btn = this.search_results_container.querySelector('button');
        this.spotify_code_elem = this.querySelector('#spoties-spotify-code');

        this.search_url_field = this.querySelector('#spoties-search-url');
        this.search_url_btn = this.querySelector('#spoties-search-url-btn');
        this.search_toggle_method = this.querySelector('#spoties-search-toggle-method');

        this.errors = this.querySelector('spoties-option-errors');

        this.spotify_uri = null;

        this.timeout = null;
        this.loading = false;

        this.search_field.addEventListener('keyup', () => {
            clearTimeout(this.timeout);
            this.timeout = setTimeout(() => {
                this.onSearch();
            }, 500);
        });

        this.load_more_btn.addEventListener('click', () => this.onLoadMore());

        this.search_url_btn.addEventListener('click', () => {
            this.errors.clear();
            const url = this.search_url_field.value;
            const regex = /((https?:\/\/)?(www.)?open.spotify\.com\/(playlist|album|track|artist)\/[a-zA-Z0-9]{22})(\?si=[a-zA-Z0-9]*)?/g;
            if (!regex.test(url)) {
                this.errors.add('Spotify-länken verkar inte vara giltig.')
                return;
            }
            const type = url.match(/(playlist|album|track|artist)/g);
            const id = url.match(/[a-zA-Z0-9]{22}/g);
            const spotify_uri = `spotify:${type}:${id}`;
            this.setSpotifyUri(spotify_uri);
            this.search_url_field.value = '';
        });

        this.search_toggle_method.addEventListener('click', () => {
            const show_search = this.querySelector('.spoties_search_fields').style.display === 'none';
            this.querySelector('.spoties_search_fields').style.display = show_search ? 'grid' : 'none';
            this.querySelector('.spoties_search_url').style.display = show_search ? 'none' : 'grid';

            const toggle_text = this.querySelector('#spoties-search-toggle-method');
            toggle_text.children[0].style.display = show_search ? 'block' : 'none';
            toggle_text.children[1].style.display = show_search ? 'none' : 'block';
        });
    }

    get spotify_code() {
        return this.base64toBlob(this.spotify_code_elem.src.split(',')[1], 'images/png');
    }

    validate() {
        this.errors.clear();
        let valid = true;
        if (this.required) {
            valid = this.spotify_uri !== '' && this.spotify_uri != null;
            if (!valid) {
                this.errors.add('Var vänlig och välj en låt')
            }
        }
        return valid;
    }

    clearResults() {
        while (this.search_results.firstChild) {
            this.search_results.removeChild(this.search_results.lastChild);
        }
    }

    onSearch() {
        const search = this.search_field.value;
        if (this.loading || search.trim() === '') {
            return;
        }
        this.clearResults();
        this.getResults(search).then(results => this.showResults(results));
    }

    onLoadMore() {
        const search = this.search_field.value;
        if (this.loading || search.trim() === '') {
            return;
        }
        const offset = this.search_results.childElementCount;
        this.getResults(search, offset).then(results => this.showResults(results));
    }

    getToken() {
        return fetch("https://ai.soufeel.com/spotify/tokens")
            .then((response) => response.json())
            .then(response => response.token);
    }

    getResults(search, offset = 0) {
        return this.getToken()
            .then((token) => {
                const type = this.search_type_field.value;
                const url = `https://api.spotify.com/v1/search?q=${search}&offset=${offset}&limit=5&type=${type}&market=SE`;
                return fetch(url, {
                    headers: new Headers({
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }),
                }).then((response) => response.json());
            });
    }

    showResults(results) {
        const items = results.tracks ? results.tracks.items : results.albums.items;
        items.forEach(item => {
            const album = item.album ? item.album : item;
            const name = item.name;
            const artists = album.artists
                .map((a) => a.name)
                .join(', ');
            const image = album.images[1].url;
            const uri = item.uri;

            const result = this.createSearchResult(image, name, artists);
            result.addEventListener('click', () => {
                this.setSpotifyUri(uri)
                    .finally(() => {
                        this.search_results_container.style.display = "none";
                        this.dispatchEvent(new CustomEvent('resClick', {
                            detail: {
                                record: name,
                                artists,
                                image
                            }
                        }));
                        this.search_field.value = '';
                    });
            });
            this.search_results.append(result);
            this.search_results_container.style.display = "block";
        });
    }

    setSpotifyUri(uri) {
        return this.getSpotifyCode(uri)
            .then((src) => {
                this.spotify_code_elem.src = src;
                this.spotify_uri = uri;
                this.spotify_code_elem.style.display = "block";
                this.dispatchEvent(new CustomEvent('update', {
                    detail: {
                        'spoties-code': src,
                        'spotify-uri': uri,
                    }
                }));
            });
    }

    createSearchResult(image, name, artists) {
        const div = document.createElement('div');
        div.innerHTML = `<img src="${image}"><div><p>${name}</p><p>${artists}</p></div>`;
        return div;
    }
}

if (!customElements.get('spoties-search-field')) {
    customElements.define('spoties-search-field', SpotiesSearch);
}

class SpotiesCoverImage extends SpotiesElement {
    constructor() {
        super();

        this.spoties_fields = this.closest('spoties-fields');
        this.cover_upload_field = this.querySelector('input[type="file"]');
        this.cover_image_container = this.querySelector('.cover-image-container');
        this.cover_image_elem = this.cover_image_container.querySelector('img');

        this.modal = this.querySelector('#SpotiesModal-Cover-Edit');
        this.modal_image = this.modal.querySelector('img');
        this.modal_save = this.modal.querySelector('button');

        this.remove_cover_btn = this.querySelector('#remove-cover');

        this.errors = this.querySelector('spoties-option-errors');

        this.cover_data = null;
        this.cropper = null;

        this.manual_value = false;

        this.spoties_fields.addEventListener('spotiesSelected', (event) => {
            if(!this.cover_data || !this.manual_value) {
                this.imgUrlToBase64(event.detail.image).then((image) => {
                    this.setCoverImage(image);
                    this.manual_value = false;
                });
            }
        });

        this.remove_cover_btn.addEventListener('click', (event) => {
            this.cover_image_elem.setAttribute('src', '');
            this.cover_data = null;
            this.dispatchEvent(new CustomEvent('update', { detail: { 'spoties-cover': null } }));
            this.cover_image_container.style.display = "none";
        });

        this.cover_upload_field.addEventListener('change', (event) => { this.uploadFile(event.target.files[0]) });

        this.modal_save.addEventListener('click', () => this.onSave());
    }

    get cover_image() {
        return this.base64toBlob(this.cover_data.split(',')[1], 'images/png');
    }

    validate() {
        this.errors.clear();
        const valid = this.cover_data !== '' && this.cover_data != null;
        if (!valid) {
            this.errors.add('Var vänlig och ange en omslagsbild')
        }
        return valid;
    }

    uploadFile(file) {
        this.toBase64(file).then((image_data) => {
            const image = this.modal.querySelector('img');
            image.src = image_data;
            this.modal.show(this.cover_upload_field);
            this.cropper = new Cropper(image, {
                aspectRatio: 1,
                viewMode: 1,
            });
        });
        this.cover_upload_field.value = '';
    }

    onSave() {
        const image = this.cropper.getCroppedCanvas({
            maxWidth: 1920,
            maxHeight: 1920,
        })
            .toDataURL('image/jpeg');
        this.cropper.destroy();
        this.setCoverImage(image);
        this.manual_value = true;
        this.modal.hide();
    }

    setCoverImage(image) {
        this.cover_data = image;
        this.cover_image_elem.src = image;
        this.cover_image_container.style.display = "block";
        this.querySelector('#SpotiesModal-Cover-Preview img').src = image;
        this.dispatchEvent(new CustomEvent('update', { detail: { 'spoties-cover': image } }));
    }
}

if (!customElements.get('spoties-cover-field')) {
    customElements.define('spoties-cover-field', SpotiesCoverImage);
}

class SpotiesTextField extends SpotiesElement {
    constructor() {
        super();
        this.input = this.querySelector('input');
        this.errors = this.querySelector('spoties-option-errors');

        this.input.addEventListener('change', () => this.onChange());
    }

    onChange() {
        let detail = {};
        detail[this.input.id] = this.input.value;
        this.dispatchEvent(new CustomEvent('update', { detail }));
    }

    get minLength() {
        if (this.input.hasAttribute('minlength')) {
            return parseInt(this.input.getAttribute('minlength'));
        }
        return null;
    }

    get maxLength() {
        if (this.input.hasAttribute('maxlength')) {
            return parseInt(this.input.getAttribute('maxlength'));
        }
        return null;
    }

    validate() {
        this.errors.clear();
        const length = this.input.value.length;

        const required_valid = this.input.hasAttribute('required') ? this.input.value.trim() !== '' : true;
        const min_valid = this.minLength ? length >= this.minLength : true;
        const max_valid = this.maxLength ? length <= this.maxLength : true;

        if (!required_valid && min_valid) {
            this.errors.add('Var vänlig och ange')
        }
        if (!min_valid) {
            this.errors.add(`Var vänlig och ange minst ${this.input.getAttribute('minlength')} tecken`)
        }
        if (!max_valid) {
            this.errors.add(`Var vänlig och ange max ${this.input.getAttribute('maxlength')} tecken`)
        }
        return required_valid && min_valid && max_valid;
    }
}

if (!customElements.get('spoties-text-field')) {
    customElements.define('spoties-text-field', SpotiesTextField);
}

class SpotiesRecordField extends SpotiesTextField {
    constructor() {
        super();

        this.spoties_fields = this.closest('spoties-fields');
        this.update_value = 'record';
        this.manual_value = false;

        this.spoties_fields.addEventListener('spotiesSelected', (event) => {
            if(!this.manual_value || !this.input.value) {
                const value = event.detail[this.update_value];
                this.input.value = value.substring(0, this.maxLength || value.length);
                this.onChange();
                this.manual_value = false;
            }
        });
    }

    onChange() {
        super.onChange();
        this.manual_value = true;
    }
}

if (!customElements.get('spoties-record-name-field')) {
    customElements.define('spoties-record-name-field', SpotiesRecordField);
}

class SpotiesArtistField extends SpotiesRecordField {
    constructor() {
        super();
        this.update_value = 'artists';
    }
}

if (!customElements.get('spoties-artist-field')) {
    customElements.define('spoties-artist-field', SpotiesArtistField);
}

class SpotiesOptionField extends SpotiesElement {
    validate() {
        return true;
    }
}

if (!customElements.get('spoties-option-field')) {
    customElements.define('spoties-option-field', SpotiesOptionField);
}

class SpotiesOptionErrors extends SpotiesElement {
    clear() {
        while (this.firstChild) {
            this.removeChild(this.lastChild);
        }
    }

    add(message) {
        const error = document.createElement('div');
        error.innerHTML = message;
        error.addEventListener('click', () => this.removeChild(error));
        this.appendChild(error);
    }
}

if (!customElements.get('spoties-option-errors')) {
    customElements.define('spoties-option-errors', SpotiesOptionErrors);
}

class SpotiesProductPreviewImage extends SpotiesElement {
    constructor() {
        super();
        this.modal = this.querySelector('modal-dialog');

        this.preview_image = this.modal.querySelector('img');

        this.spoties_fields = document.querySelector('spoties-fields');
        this.variant_radios = document.querySelector('variant-radios');

        this.template_images = JSON.parse(this.getAttribute('templateImages')) || [];
        this.settings = JSON.parse(this.getAttribute('settings')) || [];

        this.defaults = {
            record: this.getAttribute('defaultRecordName'),
            artist: this.getAttribute('defaultArtistName'),
            cover: this.getAttribute('defaultCoverImage'),
            spotify_uri: this.getAttribute('defaultSpotifyUri'),
        }

        this.last_print = {};
        this.modal.addEventListener('open', () => {
            const new_print = {
                template: this.template_image,
                data: { ...this.spoties_fields.data }
            }

            if (JSON.stringify(this.last_print) !== JSON.stringify(new_print)) {
                this.getPreviewImage().then((image_src) => {
                    this.updatePreviewImage(image_src);
                    this.last_print = new_print;
                });
            }
        })

        if (this.variant_radios) {
            this.variant_radios.addEventListener('change', () => {
                this.current_variant = this.variant_radios.currentVariant.id;
            });
        }
    }

    get current_variant() {
        return this.getAttribute('selectedVariant');
    }

    set current_variant(value) {
        this.setAttribute('selectedVariant', value);
    }

    get preview() {
        return this.template_images.find((template_image) => template_image.variants.includes(this.current_variant));
    }

    get preview_id() {
        return this.preview.id;
    }

    get template_image() {
        return this.preview.src;
    }

    getPreviewImage() {
        const data = { ...this.spoties_fields.data };
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext("2d");
        return this.imgUrlToBase64(this.template_image)
            .then((template_src) => this.loadImage(template_src))
            .then((template_image) => {
                canvas.width = template_image.naturalWidth;
                canvas.height = template_image.naturalHeight;
                ctx.drawImage(template_image, 0, 0);

                let promises = [];

                // Convert to Image
                this.settings[this.preview_id].forEach((element) => {
                    if (element.type === 'cover' && typeof data[`spoties-cover`] !== 'object') {
                        const key = `spoties-cover`;
                        const src = data[key] || this.defaults['cover'];
                        const promise = this.loadImage(src).then((image) => {
                            data[key] = image;
                        });
                        promises.push(promise);
                    }
                    else if (element.type === 'code' && typeof data[`spoties-code-${this.preview_id}`] !== 'object') {
                        const src = data['spotify-uri'] || this.defaults['spotify_uri'];
                        const color = element.color || 'black';
                        const promise = this.getSpotifyCode(src, true, true, color).then((src) => {
                            return this.loadImage(src);
                        }).then((image) => {
                            data[`spoties-code-${this.preview_id}`] = image;
                        });
                        promises.push(promise);
                    }
                    else if ((element.type === 'record' ||
                        element.type === 'artist' ||
                        element.type === 'text') &&
                        element.font?.src) {
                        // Load fonts
                        promises.push(new Promise((resolve, reject) => {
                            var font = new FontFace(element.font.name, `url(${element.font.src})`);
                            font.load().then(function (loaded_face) {
                                document.fonts.add(loaded_face);
                                resolve()
                            }).catch((err) => reject(err));
                        }));
                    }
                });
                return Promise.all(promises);
            })
            .then(() => {
                this.settings[this.preview_id].forEach((element) => {
                    const key = `spoties-${element.type === 'text' ? element.inputId : element.type}`;
                    switch (element.type) {
                        case 'cover':
                        case 'code':
                            const image = data[`${key}${element.type === 'code' ? '-' + this.preview_id : ''}`];
                            if(!image)
                                break;
                            if (element.rotate) {
                                const positionX = element.position[0];
                                const positionY = element.position[1];
                                const radians = (element.rotate || 1) * (Math.PI / 180);
                                ctx.translate(positionX, positionY);
                                ctx.rotate(radians);
                                ctx.drawImage(image, 0, 0, element.width, element.height);
                                ctx.rotate(-radians);
                                ctx.translate(-positionX, -positionY);
                            }
                            else {
                                ctx.drawImage(image, element.position[0], element.position[1], element.width, element.height);
                            }
                            break;
                        case 'record':
                        case 'artist':
                        case 'text':
                            const text = data[key] || this.defaults[element.type] || element.default;
                            if(!text)
                                break;
                            ctx.font = `${element.font?.weight || 'normal'} ${element.font?.size || 50}px ${element.font?.name || 'arial'}`;
                            ctx.textAlign = element.align || "center";
                            ctx.fillStyle = element.color || "black";
                            ctx.fillText(text, element.position[0], element.position[1]);
                            break;
                    }
                });
                return canvas.toDataURL()
            });
    }

    updatePreviewImage(image_src) {
        this.preview_image.src = image_src;
    }
}

if (!customElements.get('spoties-preview')) {
    customElements.define('spoties-preview', SpotiesProductPreviewImage);
}

class SpotiesFields extends SpotiesElement {
    constructor() {
        super();

        this.search_field = this.querySelector('spoties-search-field');
        this.cover_field = this.querySelector('spoties-cover-field');
        this.preview = document.querySelector('spoties-preview');

        this.data = {}

        if (this.search_field) {
            this.search_field.addEventListener('resClick', (event) => {
                this.dispatchEvent(new CustomEvent('spotiesSelected', { detail: event.detail }));
            });
        }

        const children = Array.from(this.children);
        children.forEach((child) => {
            child.addEventListener('update', (event) => {
                this.data = Object.assign(this.data, event.detail);
                this.dispatchEvent(new CustomEvent('spotiesUpdate', { detail: event.detail }))
            });
        });
    }

    validate() {
        const children = Array.from(this.children);
        const valid = children.map((child) => child.validate()).every(Boolean);
        return valid;
    }

    addToFormData(formData) {
        return new Promise((resolve, reject) => {
            if (this.search_field && this.search_field.required) {
                formData.append('properties[_Spotify URI]', this.search_field.spotify_uri);
                formData.append('properties[Spotify Code]', this.search_field.spotify_code, 'spotify_code.png');
            }
            if (this.cover_field) {
                formData.append('properties[Cover Image]', this.cover_field.cover_image, 'cover_image.png');
            }
            if (this.preview) {
                this.preview.getPreviewImage()
                    .then((image_src) => this.base64toBlob(image_src.split(',')[1], 'images/png'))
                    .then((blob) => {
                        formData.append('properties[_Preview Image]', blob, 'preview_image.png');
                        resolve();
                    }).
                    catch((err) => reject(err));
            } else {
                resolve();
            }
        });
    }
}

if (!customElements.get('spoties-fields')) {
    customElements.define('spoties-fields', SpotiesFields);
}