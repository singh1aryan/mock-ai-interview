const handleDownload = async () => {
    if (recordedChunks.length) {
      setSubmitting(true);
      setStatus("Processing");
      setGeneratedFeedback("");
      const file = new Blob(recordedChunks, {
        type: `video/webm`,
      });

      const unique_id = uuid();

      // This checks if ffmpeg is loaded
      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
      }

      // This writes the file to memory, removes the video, and converts the audio to mp3
      ffmpeg.FS("writeFile", `${unique_id}.webm`, await fetchFile(file));
      await ffmpeg.run(
        "-i",
        `${unique_id}.webm`,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "mp3",
        `${unique_id}.mp3`
      );

      // This reads the converted file from the file system
      const fileData = ffmpeg.FS("readFile", `${unique_id}.mp3`);

      // This creates a new file from the raw data
      const output = new File([fileData.buffer], `${unique_id}.mp3`, {
        type: "audio/mp3",
      });

      //check the size of the file
      console.log(output);
      const formData = new FormData();
      formData.append("file", output, `${unique_id}.mp3`);
      formData.append("model", "whisper-1");

      setCompleted(true);

      setStatus("Transcribing");

      const upload = await fetch(`/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      const results = await upload.json();
      console.log(results);

      if (upload.ok) {
        setIsSuccess(true);
        setSubmitting(false);

        if (results.error) {
          setTranscript(results.error);
        } else {
          setTranscript(results.transcript);
        }

        console.log("Uploaded successfully!");

        await Promise.allSettled([
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]).then(() => {
          setCompleted(true);
          console.log("Success!");
        });

        if (results.transcript.length <= 0) {
          console.log("No transcript");
        }

        if (results.transcript.length > 0) {
          let prompt =
            `Please give feedback on the following interview question: ${question.question} given the following transcript: ${results.transcript}. ` +
            `Please also give feedback on the candidate's communication skills.\nMake sure they accurately explain their thoughts in a coherent way. \nMake sure they stay on topic and relevant to the question. 
            evaluate the candidates interview response based on the following criteria, each rated on a scale of 1 to 5, where 1 represents Poor and 5 represents Excellent: Clarity: How well did the candidate articulate their thoughts and ideas? Was the response easy to understand, with clear communication? Rate from 1 to 5.
            Relevance: Did the response directly address the question asked? Was it on-topic and free from unrelated information? Rate from 1 to 5.
            Completeness: Did the response provide a comprehensive answer, covering all aspects of the question, or did it leave out important details? Rate from 1 to 5.
            Depth of Knowledge: Did the candidate demonstrate a deep understanding of the topic discussed? Were they able to provide insightful explanations and examples? Rate from 1 to 5.
            Correctness: Was the information provided in the response accurate and free from factual errors? Rate from 1 to 5.
            Please provide constructive feedback on the candidate's response. Highlight areas where the candidate excelled and areas that may need improvement. Suggest specific ways in which the answer can be enhanced in terms of clarity, relevance, completeness, depth of knowledge, and correctness.
            }
              \n\n\ Feedback on the candidate's response:`;

          // Please give feedback on the following interview question: ${question} given the following transcript: ${
          //   results.transcript
          // }. ${"Please also give feedback on the candidate's communication skills. Make sure they accurately explain their thoughts in a coherent way. Make sure they stay on topic and relevant to the question."} \n\n\ Feedback on the candidate's response:`;

          prompt = encryptDataWithKeyAndIV(
            prompt,
            process.env.NEXT_PUBLIC_DATA_ENCRYPTION_KEY,
            process.env.NEXT_PUBLIC_DATA_ENCRYPTION_IV
          );
          setGeneratedFeedback("");

          const response = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
            }),
          });

          if (!response.ok) {
            throw new Error(response.statusText);
          }

          // This data is a ReadableStream
          const data = response.body;
          if (!data) {
            return;
          }

          const reader = data.getReader();
          const decoder = new TextDecoder();
          let done = false;

          while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = decoder.decode(value);
            setGeneratedFeedback((prev) => prev + chunkValue);
          }
        }
      } else {
        console.error("Upload failed.");
      }

      setTimeout(function () {
        setRecordedChunks([]);
      }, 1500);
    }
  };
